import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../../../src/database/database.service';
import { createWaitlistRoutes } from '../../../src/routes/waitlist';

function signupRequest(body: Record<string, unknown>, ip: string) {
  return new Request('http://account-engine.test/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'fly-client-ip': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('waitlist first-touch persistence', () => {
  it('keeps the first attributed release when a normalized email signs up again', async () => {
    const stored = new Map<string, Record<string, unknown>>();
    const upsert = vi.fn(
      async (
        values: Record<string, unknown>,
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) => {
        const email = String(values.email);
        if (!options.ignoreDuplicates || options.onConflict !== 'email') {
          stored.set(email, { ...values });
        } else if (!stored.has(email)) {
          stored.set(email, { ...values });
        }
        return { error: null };
      },
    );
    const client = {
      from: vi.fn(() => ({ upsert })),
      schema: vi.fn(() => ({
        from: vi.fn(() => {
          const filters = new Map<string, string>();
          const query = {
            select: vi.fn(() => query),
            eq: vi.fn((column: string, value: string) => {
              filters.set(column, value);
              return query;
            }),
            maybeSingle: vi.fn(async () => ({
              data: {
                id:
                  filters.get('platform') === 'youtube'
                    ? 'job-first-touch'
                    : 'job-later-touch',
              },
              error: null,
            })),
          };
          return query;
        }),
      })),
    };
    const databaseService = {
      getClient: () => client,
    } as unknown as DatabaseService;
    const app = createWaitlistRoutes(databaseService);

    const first = await app.request(
      signupRequest(
        {
          email: 'first-touch@example.com',
          utmSource: 'youtube',
          utmMedium: 'social',
          utmCampaign: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
          utmContent: 'en',
        },
        '203.0.113.20',
      ),
    );
    const repeated = await app.request(
      signupRequest(
        {
          email: ' FIRST-TOUCH@EXAMPLE.COM ',
          utmSource: 'threads',
          utmMedium: 'social',
          utmCampaign: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
          utmContent: 'ja',
        },
        '203.0.113.21',
      ),
    );

    expect(first.status).toBe(201);
    expect(repeated.status).toBe(201);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(stored.size).toBe(1);
    expect(stored.get('first-touch@example.com')).toEqual(
      expect.objectContaining({
        email: 'first-touch@example.com',
        social_publish_job_id: 'job-first-touch',
        utm_source: 'youtube',
        utm_medium: 'social',
        utm_content: 'en',
      }),
    );
  });
});
