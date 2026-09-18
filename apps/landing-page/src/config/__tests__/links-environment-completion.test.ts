import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('account-engine link environment', () => {
  it('uses the local account engine during development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { LINKS } = await import('../links');
    expect(LINKS.waitlistApi).toBe('http://127.0.0.1:3004/waitlist');
  });

  it('uses the deployed account engine outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { LINKS } = await import('../links');
    expect(LINKS.waitlistApi).toBe('https://account-engine.fly.dev/waitlist');
  });
});
