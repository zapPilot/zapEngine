import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { readSentryIssue } from './sentry-remediation.js';

describe('readSentryIssue fallback token', () => {
  it('falls back to the read-only auth token when no write token is set', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: '12345',
        shortId: 'SHORT-1',
        title: 'boom',
        status: 'unresolved',
        lastSeen: '2026-08-28T00:00:00.000Z',
      }),
    );

    const issue = await readSentryIssue({
      config: readControlCenterConfig({
        SENTRY_OPS_AUTH_TOKEN: 'read-only-token',
        SENTRY_ORG_SLUG: 'zap-pilot',
      }),
      issueId: '12345',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(issue.id).toBe('12345');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer read-only-token',
      }),
    });
  });
});
