import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { resolveSentryIssue } from './sentry-remediation.js';

describe('resolveSentryIssue', () => {
  it('fails closed without the dedicated write token', async () => {
    const fetchImpl = vi.fn();

    await expect(
      resolveSentryIssue({
        config: readControlCenterConfig({
          SENTRY_OPS_AUTH_TOKEN: 'read-only-token',
          SENTRY_ORG_SLUG: 'zap-pilot',
        }),
        issueId: '12345',
        reason: 'The fix is deployed and the issue should be closed.',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Sentry remediation is not configured');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses only the write token and only resolves one issue', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        id: '12345',
        shortId: 'ZAP-PILOT-NATIVE-1',
        title: 'useWalletProvider must be used within a WalletProvider',
        status: 'resolved',
      }),
    );

    const result = await resolveSentryIssue({
      config: readControlCenterConfig({
        SENTRY_OPS_AUTH_TOKEN: 'read-only-token',
        SENTRY_OPS_WRITE_TOKEN: 'write-token',
        SENTRY_ORG_SLUG: 'zap-pilot',
      }),
      issueId: '12345',
      reason: 'The production fix is deployed and no recurrence is expected.',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://sentry.io/api/0/organizations/zap-pilot/issues/12345/',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer write-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ status: 'resolved' }),
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('read-only-token');
    expect(result).toEqual({
      provider: 'sentry',
      issueId: '12345',
      shortId: 'ZAP-PILOT-NATIVE-1',
      title: 'useWalletProvider must be used within a WalletProvider',
      status: 'resolved',
      reason: 'The production fix is deployed and no recurrence is expected.',
    });
  });

  it('rejects an unexpected provider status', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: '12345', status: 'unresolved' }),
    );

    await expect(
      resolveSentryIssue({
        config: readControlCenterConfig({
          SENTRY_OPS_WRITE_TOKEN: 'write-token',
          SENTRY_ORG_SLUG: 'zap-pilot',
        }),
        issueId: '12345',
        reason: 'The issue is fixed.',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Sentry did not return the issue as resolved');
  });
});
