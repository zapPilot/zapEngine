import { describe, expect, it } from 'vitest';

import {
  getDesktopUserIdOverrideFromUrl,
  resolveDesktopUserId,
} from '../src/integration/legacyBundle';
import { normalizeWalletAddressList } from '../src/integration/moralisWallet';

describe('desktop legacy bundle POC identity', () => {
  it('prefers the URL userId param over the Privy/account-engine user id', () => {
    const bundleUserId = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

    expect(
      getDesktopUserIdOverrideFromUrl(`?userId=${bundleUserId}`, '', ''),
    ).toBe(bundleUserId);
    expect(
      getDesktopUserIdOverrideFromUrl('', `?userId=${bundleUserId}`, ''),
    ).toBe(bundleUserId);
    expect(
      getDesktopUserIdOverrideFromUrl('', '', `#/home?userId=${bundleUserId}`),
    ).toBe(bundleUserId);
    expect(resolveDesktopUserId('privy-user-id', bundleUserId)).toBe(
      bundleUserId,
    );
    expect(resolveDesktopUserId('privy-user-id', null)).toBe('privy-user-id');
  });

  it('uses deterministic URL source precedence for legacy bundle overrides', () => {
    expect(
      getDesktopUserIdOverrideFromUrl(
        '?userId=document-user',
        '?userId=router-user',
        '#/home?userId=hash-user',
      ),
    ).toBe('document-user');

    expect(
      getDesktopUserIdOverrideFromUrl(
        '?userId=   ',
        '?userId=router-user',
        '#/home?userId=hash-user',
      ),
    ).toBe('router-user');

    expect(
      getDesktopUserIdOverrideFromUrl(
        '',
        '?userId=   ',
        '#/home?userId=hash-user',
      ),
    ).toBe('hash-user');
  });

  it('falls back safely when both legacy and account ids are blank', () => {
    expect(resolveDesktopUserId(' account-user ', null)).toBe('account-user');
    expect(resolveDesktopUserId('   ', '  legacy-user  ')).toBe('legacy-user');
    expect(resolveDesktopUserId('   ', '   ')).toBeNull();
    expect(getDesktopUserIdOverrideFromUrl('', '', '#/home')).toBeNull();
  });

  it('normalizes bundle wallet addresses before Moralis aggregation', () => {
    expect(
      normalizeWalletAddressList([
        ' 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD ',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        '',
        null,
      ]),
    ).toEqual(['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd']);
  });
});
