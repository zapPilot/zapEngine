import { describe, expect, it, vi } from 'vitest';

import { getErrorStatus } from '../../../src/common/http';
import type { DatabaseService } from '../../../src/database/database.service';
import { createWaitlistRoutes } from '../../../src/routes/waitlist';

function databaseFixture(jobId: string | null = 'job-123') {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: jobId ? { id: jobId } : null,
    error: null,
  });
  const socialQuery = {
    select: vi.fn(() => socialQuery),
    eq: vi.fn(() => socialQuery),
    maybeSingle,
  };
  const client = {
    schema: vi.fn(() => ({ from: vi.fn(() => socialQuery) })),
    from: vi.fn(() => ({ upsert })),
  };
  const databaseService = {
    getClient: () => client,
  } as unknown as DatabaseService;
  return { databaseService, client, socialQuery, upsert };
}

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

describe('waitlist routes', () => {
  it('normalizes email and resolves a social release to the canonical publish job', async () => {
    const fixture = databaseFixture('job-42');
    const app = createWaitlistRoutes(fixture.databaseService);

    const response = await app.request(
      signupRequest(
        {
          email: '  USER@Example.com ',
          ctaLocation: 'hero',
          landingPath: '/',
          utmSource: 'youtube',
          utmMedium: 'social',
          utmCampaign: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
          utmContent: 'en',
        },
        '203.0.113.1',
      ),
    );

    expect(response.status).toBe(201);
    expect(fixture.client.schema).toHaveBeenCalledWith('from_fed_to_chain');
    expect(fixture.socialQuery.eq).toHaveBeenCalledWith(
      'episode_id',
      '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
    );
    expect(fixture.socialQuery.eq).toHaveBeenCalledWith('platform', 'youtube');
    expect(fixture.socialQuery.eq).toHaveBeenCalledWith('language_code', 'en');
    expect(fixture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        social_publish_job_id: 'job-42',
        utm_source: 'youtube',
        utm_medium: 'social',
      }),
      { onConflict: 'email', ignoreDuplicates: true },
    );
  });

  it('keeps non-social acquisition without inventing a social job', async () => {
    const fixture = databaseFixture();
    const app = createWaitlistRoutes(fixture.databaseService);

    const response = await app.request(
      signupRequest(
        {
          email: 'direct@example.com',
          ctaLocation: 'navbar',
          utmSource: 'google',
          utmMedium: 'organic',
        },
        '203.0.113.2',
      ),
    );

    expect(response.status).toBe(201);
    expect(fixture.client.schema).not.toHaveBeenCalled();
    expect(fixture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ social_publish_job_id: null }),
      expect.any(Object),
    );
  });

  it('accepts honeypot submissions without writing them', async () => {
    const fixture = databaseFixture();
    const app = createWaitlistRoutes(fixture.databaseService);

    const response = await app.request(
      signupRequest(
        { email: 'bot@example.com', company: 'Spam Incorporated' },
        '203.0.113.3',
      ),
    );

    expect(response.status).toBe(200);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid email before persistence', async () => {
    const fixture = databaseFixture();
    const app = createWaitlistRoutes(fixture.databaseService);

    const response = await app.request(
      signupRequest({ email: 'not-an-email' }, '203.0.113.4'),
    );

    expect(response.status).toBe(400);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });
  it('returns success for duplicates while retaining first-touch insert options', async () => {
    const fixture = databaseFixture();
    const app = createWaitlistRoutes(fixture.databaseService);
    for (const email of ['dup@example.com', ' DUP@EXAMPLE.COM ']) {
      expect(
        (await app.request(signupRequest({ email }, '203.0.113.5'))).status,
      ).toBe(201);
    }
    expect(fixture.upsert).toHaveBeenCalledTimes(2);
    for (const [values, options] of fixture.upsert.mock.calls) {
      expect(values.email).toBe('dup@example.com');
      expect(options).toEqual({ onConflict: 'email', ignoreDuplicates: true });
    }
  });

  it('ignores a client-supplied canonical job id', async () => {
    const fixture = databaseFixture(null);
    const response = await createWaitlistRoutes(
      fixture.databaseService,
    ).request(
      signupRequest(
        {
          email: 'unresolved@example.com',
          social_publish_job_id: 'forged-job',
          utmSource: 'youtube',
          utmMedium: 'social',
          utmCampaign: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
          utmContent: 'en',
        },
        '203.0.113.6',
      ),
    );
    expect(response.status).toBe(201);
    expect(fixture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ social_publish_job_id: null }),
      expect.any(Object),
    );
  });

  it('does not persist a social signup when canonical attribution lookup fails', async () => {
    const fixture = databaseFixture();
    fixture.socialQuery.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'social lookup unavailable' },
    });
    const app = createWaitlistRoutes(fixture.databaseService);
    app.onError(() => new Response('Unavailable', { status: 500 }));

    const response = await app.request(
      signupRequest(
        {
          email: 'lookup-failed@example.com',
          utmSource: 'threads',
          utmMedium: 'social',
          utmCampaign: '72f1ee5b-3f57-4e32-b7ad-fe57666985d6',
          utmContent: 'ja',
        },
        '203.0.113.9',
      ),
    );

    expect(response.status).toBe(500);
    expect(fixture.upsert).not.toHaveBeenCalled();
  });

  it('limits repeated requests and allows retry after the window', async () => {
    vi.useFakeTimers();
    try {
      const fixture = databaseFixture();
      const app = createWaitlistRoutes(fixture.databaseService);
      app.onError(
        (error) =>
          new Response(error.message, { status: getErrorStatus(error) }),
      );
      const request = () =>
        app.request(
          signupRequest({ email: 'limited@example.com' }, '203.0.113.7'),
        );
      for (let i = 0; i < 10; i++) expect((await request()).status).toBe(201);
      expect((await request()).status).toBe(429);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect((await request()).status).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not report success when persistence fails', async () => {
    const fixture = databaseFixture();
    fixture.upsert.mockResolvedValueOnce({
      error: { message: 'database unavailable' },
    });
    const app = createWaitlistRoutes(fixture.databaseService);
    app.onError(() => new Response('Unavailable', { status: 500 }));
    const response = await app.request(
      signupRequest({ email: 'failed@example.com' }, '203.0.113.8'),
    );
    expect(response.status).toBe(500);
  });
});
