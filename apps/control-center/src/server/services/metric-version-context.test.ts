import { describe, expect, it, vi } from 'vitest';
import { readControlCenterConfig } from '../config/env.js';
import { readMetricVersionContext } from './metric-version-context.js';
const now = new Date('2026-09-16T07:00:00Z');
const config = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'read-token' });
const mainSha = 'a'.repeat(40);
const deployedSha = 'b'.repeat(40);
const deployment = {
  id: 1,
  sha: deployedSha,
  environment: 'production',
  production_environment: true,
};
const response = (body: unknown) => new Response(JSON.stringify(body));

describe('metric version evidence', () => {
  it('does not fetch without credentials or pretend main was deployed', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await readMetricVersionContext({
      config: readControlCenterConfig({}),
      now,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mainSha: null, deployments: [] });
    expect(result.gaps).not.toEqual([]);
  });
  it('joins only successful production deployment statuses to their own SHA', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('commits/main')) {
        return response({ sha: mainSha });
      }
      if (String(url).includes('/statuses')) {
        return response([
          { state: 'success', created_at: '2026-09-15T12:00:00Z' },
        ]);
      }
      return response([
        deployment,
        { ...deployment, id: 2, production_environment: false },
      ]);
    });
    const result = await readMetricVersionContext({ config, now, fetchImpl });
    expect(result.mainSha).toBe(mainSha);
    expect(result.deployments).toEqual([
      expect.objectContaining({
        sha: deployedSha,
        deployedAt: '2026-09-15T12:00:00Z',
        deploymentId: 1,
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it.each(['failure', 'inactive', 'pending'])(
    'excludes %s deployment statuses',
    async (state) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ sha: mainSha }))
        .mockResolvedValueOnce(response([deployment]))
        .mockResolvedValueOnce(
          response([{ state, created_at: now.toISOString() }]),
        );
      expect(
        (await readMetricVersionContext({ config, now, fetchImpl }))
          .deployments,
      ).toEqual([]);
    },
  );
  it('records permission failures as gaps, with no fabricated version', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 403 }));
    expect(
      await readMetricVersionContext({ config, now, fetchImpl }),
    ).toMatchObject({
      mainSha: null,
      deployments: [],
      gaps: expect.arrayContaining([
        'main SHA could not be read',
        'Deployment inventory could not be read',
      ]),
    });
  });
  it('records truncation and failed status reads', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ sha: mainSha }))
      .mockResolvedValueOnce(
        response(
          Array.from({ length: 20 }, (_, i) => ({ ...deployment, id: i + 1 })),
        ),
      )
      .mockRejectedValue(new Error('offline'));
    const result = await readMetricVersionContext({ config, now, fetchImpl });
    expect(result.deployments).toEqual([]);
    expect(result.gaps).toContain('Deployment inventory capped at 20');
    expect(result.gaps).toContain('A deployment status could not be read');
  });
});
