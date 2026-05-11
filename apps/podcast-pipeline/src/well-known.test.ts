import { describe, expect, it, vi } from 'vitest';

const { mockServe } = vi.hoisted(() => ({
  mockServe: vi.fn(),
}));

vi.mock('@hono/node-server', () => ({
  serve: mockServe,
}));

const app = (await import('./index.js')).default;

describe('Universal Link well-known routes', () => {
  it('serves the Apple app site association document as JSON', async () => {
    const response = await app.request(
      '/.well-known/apple-app-site-association',
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['LP8CA4MT6U.com.example.fromFedToChainApp'],
            components: [{ '/': '/e/*' }],
          },
        ],
      },
    });
  });

  it('redirects episode share links to the App Store placeholder', async () => {
    const response = await app.request('/e/test-id');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://apps.apple.com/?utm_source=share',
    );
  });

  it('serves an empty Android asset links document', async () => {
    const response = await app.request('/.well-known/assetlinks.json');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toEqual([]);
  });
});
