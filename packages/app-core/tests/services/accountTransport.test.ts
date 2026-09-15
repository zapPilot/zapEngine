import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureAppCoreEnv } from '../../src/lib/env/runtimeEnv';
import * as account from '../../src/services/accountService';
import * as wallet from '../../src/services/walletService';
import * as telegram from '../../src/services/telegramService';

const fetchMock = vi.fn<typeof fetch>();
const ok = { success: true, message: 'updated' };
beforeEach(() => {
  configureAppCoreEnv({ VITE_ACCOUNT_API_URL: 'https://account.example' });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  configureAppCoreEnv({});
});
function respond(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => Response.json(body, { status }));
}
function request() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}
describe('account API transport and validation', () => {
  it('looks up a wallet without creating account state and validates connect responses', async () => {
    respond({ user_id: 'u' });
    await expect(account.getUserByWallet('0xabc')).resolves.toEqual({
      user_id: 'u',
    });
    expect(request()).toEqual({
      url: 'https://account.example/users/by-wallet/0xabc',
      method: 'GET',
      body: undefined,
    });
    respond({ user_id: 'u', is_new_user: true });
    await expect(account.connectWallet('0xabc')).resolves.toMatchObject({
      is_new_user: true,
    });
    expect(request()).toEqual({
      url: 'https://account.example/users/connect-wallet',
      method: 'POST',
      body: { wallet: '0xabc' },
    });
    respond({ user_id: 42 });
    await expect(account.connectWallet('0xabc')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('validates profiles and normalizes ETL status fields', async () => {
    const user = {
      id: 'u',
      is_subscribed_to_reports: false,
      created_at: '2026-01-01',
    };
    respond({ user, wallets: [] });
    await expect(account.getUserProfile('u')).resolves.toEqual({
      user,
      wallets: [],
    });
    respond({
      job_id: 'j',
      status: 'completed',
      records_processed: 5,
      records_inserted: 3,
      created_at: 'start',
      completed_at: 'end',
      duration: 2,
    });
    await expect(account.getEtlJobStatus('j')).resolves.toMatchObject({
      jobId: 'j',
      status: 'completed',
      recordsProcessed: 5,
      recordsInserted: 3,
      createdAt: 'start',
      completedAt: 'end',
      duration: 2,
    });
    expect(request().url).toBe('https://account.example/etl/jobs/j');
    respond({ job_id: 'j', status: 'pending' });
    expect((await account.getEtlJobStatus('j')).createdAt).toBe('');
    respond({ job_id: 'j', status: 'invented' });
    await expect(account.getEtlJobStatus('j')).rejects.toThrow();
  });
  it('uses PUT for email subscription and DELETE to unsubscribe', async () => {
    respond(ok);
    await wallet.updateUserEmailSubscription('u', 'me@example.com');
    expect(request()).toEqual({
      url: 'https://account.example/users/u/email',
      method: 'PUT',
      body: { email: 'me@example.com' },
    });
    await wallet.unsubscribeUserEmail('u');
    expect(request()).toEqual({
      url: 'https://account.example/users/u/email',
      method: 'DELETE',
      body: undefined,
    });
  });
  it('normalizes wallet lists and reports mutation outcomes', async () => {
    respond([
      {
        id: 'w',
        user_id: 'u',
        wallet: '0xabc',
        label: 'Savings',
        created_at: '2026-01-01',
      },
    ]);
    expect(await wallet.loadWallets('u')).toEqual(
      expect.arrayContaining([expect.objectContaining({ address: '0xabc' })]),
    );
    respond({ wallet_id: 'w', message: 'added', ownership_verified: true });
    await expect(
      wallet.addWallet('u', '0xabc', 'sig', 'Savings'),
    ).resolves.toMatchObject({ success: true });
    expect(request().body).toEqual({
      wallet: '0xabc',
      signature: 'sig',
      label: 'Savings',
    });
    respond({
      success: true,
      message: 'verified',
      ownership_verified_at: '2026-01-01T00:00:00Z',
    });
    await expect(
      wallet.verifyWallet('u', '0xabc', 'sig'),
    ).resolves.toMatchObject({ success: true });
    respond({ message: 'updated' });
    await expect(
      wallet.updateManagedWalletLabel('u', '0xabc', 'New'),
    ).resolves.toMatchObject({ success: true });
    expect(request().body).toEqual({ label: 'New' });
    await expect(wallet.removeWallet('u', 'w')).resolves.toMatchObject({
      success: true,
    });
    expect(request().url).toBe('https://account.example/users/u/wallets/w');
    respond({ message: 'no access' }, 403);
    await expect(wallet.loadWallets('u')).resolves.toEqual([]);
    await expect(
      wallet.addWallet('u', '0xabc', undefined, ''),
    ).resolves.toMatchObject({ success: false });
  });
  it.each([
    [
      400,
      'wallet invalid',
      'Invalid wallet address format. Must be a 42-character Ethereum address.',
    ],
    [400, 'invalid input', 'invalid input'],
    [
      404,
      'missing',
      'User account not found. Please connect your wallet first.',
    ],
    [
      409,
      'wallet already belongs to another user',
      'wallet already belongs to another user',
    ],
    [
      409,
      'wallet conflict',
      'This wallet is already associated with an account.',
    ],
    [409, 'email conflict', 'This email address is already in use.'],
    [409, 'other conflict', 'other conflict'],
    [
      422,
      'bad',
      'Invalid request data. Please check your input and try again.',
    ],
    [403, 'denied', 'denied'],
  ])('maps HTTP %s with message %s', async (status, message, expected) => {
    respond({ message }, status);
    await expect(account.getUserProfile('u')).rejects.toThrow(expected);
  });
});
describe('Telegram account boundary', () => {
  it('uses dedicated token, status and disconnect routes', async () => {
    respond({
      token: 'token',
      deepLink: 'https://t.me/bot',
      botName: 'bot',
      expiresAt: 'later',
    });
    await expect(telegram.requestTelegramToken('u')).resolves.toMatchObject({
      token: 'token',
    });
    expect(request()).toEqual({
      url: 'https://account.example/users/u/telegram/request-token',
      method: 'POST',
      body: undefined,
    });
    respond({ isConnected: true, isEnabled: true, connectedAt: 'now' });
    await expect(telegram.getTelegramStatus('u')).resolves.toMatchObject({
      isConnected: true,
    });
    expect(request().method).toBe('GET');
    respond(ok);
    await expect(telegram.disconnectTelegram('u')).resolves.toEqual(ok);
    expect(request()).toEqual({
      url: 'https://account.example/users/u/telegram/disconnect',
      method: 'DELETE',
      body: undefined,
    });
  });
  it.each([
    [404, 'User not found. Please connect your wallet first.'],
    [409, 'Telegram account is already connected.'],
    [410, 'Verification token has expired. Please request a new one.'],
    [429, 'Too many requests. Please wait before trying again.'],
    [403, 'denied'],
  ])('maps Telegram HTTP %s', async (status, message) => {
    respond({ message: 'denied' }, status);
    await expect(telegram.getTelegramStatus('u')).rejects.toThrow(message);
  });
});
