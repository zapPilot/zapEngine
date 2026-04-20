import {
  requireApiKey,
  resolveAdminApiKey,
} from '../../../../src/common/guards/api-key.guard';

describe('API key guard helpers', () => {
  it('prefers ADMIN_API_KEY and falls back to API_KEY', () => {
    expect(
      resolveAdminApiKey({
        ADMIN_API_KEY: 'admin-secret',
        API_KEY: 'legacy-secret',
      }),
    ).toBe('admin-secret');

    expect(resolveAdminApiKey({ API_KEY: 'legacy-secret' })).toBe(
      'legacy-secret',
    );
  });

  it('allows requests with a matching x-api-key header', async () => {
    const middleware = requireApiKey({ ADMIN_API_KEY: 'secret' });
    const next = vi.fn();

    await middleware(
      {
        req: {
          header: () => 'secret',
        },
      } as never,
      next,
    );

    expect(next).toHaveBeenCalled();
  });

  it('rejects missing x-api-key headers', async () => {
    const middleware = requireApiKey({ ADMIN_API_KEY: 'secret' });

    await expect(
      middleware(
        {
          req: {
            header: () => undefined,
          },
        } as never,
        vi.fn(),
      ),
    ).rejects.toThrow('Missing x-api-key header');
  });

  it('rejects when server has no ADMIN_API_KEY configured', async () => {
    const middleware = requireApiKey({}); // no ADMIN_API_KEY, no API_KEY

    await expect(
      middleware(
        {
          req: {
            header: () => 'some-key',
          },
        } as never,
        vi.fn(),
      ),
    ).rejects.toThrow('ADMIN_API_KEY not set');
  });

  it('rejects when key does not match', async () => {
    const middleware = requireApiKey({ ADMIN_API_KEY: 'correct' });

    await expect(
      middleware(
        {
          req: {
            header: () => 'wrong',
          },
        } as never,
        vi.fn(),
      ),
    ).rejects.toThrow('Invalid API key');
  });
});
