import { describe, expect, it, vi } from 'vitest';

const staticGET = vi.fn(async () => Response.json({ type: 'advanced' }));
const source = { pageTree: { name: 'docs' } };
const createFromSource = vi.fn(() => ({ staticGET }));

vi.mock('fumadocs-core/search/server', () => ({
  createFromSource,
}));

vi.mock('@/lib/source', () => ({
  source,
}));

describe('search route', () => {
  it('exports a static Fumadocs search GET handler', async () => {
    const route = await import('../static.json/route');

    expect(route.dynamic).toBe('force-static');
    expect(createFromSource).toHaveBeenCalledWith(source);
    expect(route.GET).toBe(staticGET);
  });
});
