import { describe, expect, it, vi } from 'vitest';
import { readControlCenterConfig } from '../../config/env.js';
import { code, dependency, secret } from './__fixtures__/github-security.js';
import { expectUnconfigured } from './adapter-testing.js';
import {
  collectGithubSecuritySignals,
  securityEvidence,
} from './github-security.js';
import {
  codeScanningSchema,
  dependabotSchema,
} from './github-security-policy.js';
import { prioritize } from './prioritize.js';
import { attachTriage } from './triage.js';
const now = new Date('2026-10-04T00:00:00Z');
const config = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'test' });
const bodies = {
  'code-scanning': [code],
  dependabot: [dependency],
  'secret-scanning': [secret],
};
function surface(url: string) {
  return Object.keys(bodies).find((key) =>
    url.includes(`/${key}/`),
  )! as keyof typeof bodies;
}
function responding() {
  return vi.fn<typeof fetch>(
    async (url) => new Response(JSON.stringify(bodies[surface(String(url))])),
  );
}
describe('GitHub Security collector', () => {
  it('is unconfigured without requests', async () =>
    expectUnconfigured({
      env: {},
      fingerprint: 'github-security:unconfigured/token',
      collect: (config, fetchImpl) =>
        collectGithubSecuritySignals({ config, fetchImpl, now }),
    }));
  it('produces exactly three fixed rollups with scalar evidence and no scoring boosts or secrets', async () => {
    const fetchImpl = responding();
    const signals = await collectGithubSecuritySignals({
      config,
      now,
      fetchImpl,
    });
    expect(signals.map((row) => row.fingerprint)).toEqual([
      'github-security:code-scanning/repository',
      'github-security:dependabot/repository',
      'github-security:secret-scanning/repository',
    ]);
    expect(signals.map((row) => row.status)).toEqual([
      'critical',
      'critical',
      'critical',
    ]);
    expect(signals[1]?.evidence).toMatchObject({
      openAlerts: 1,
      critical: 1,
      manifests: 1,
      packages: 1,
      unpatchedAlerts: 0,
      followUpTargets: 'requirements.txt',
    });
    expect(signals[0]?.evidence['followUpTargets']).toBe('1');
    expect(JSON.stringify(signals)).not.toContain(secret.secret);
    expect(
      fetchImpl.mock.calls.find(([url]) =>
        String(url).includes('/secret-scanning/'),
      )?.[0],
    ).toContain('hide_secret=true');
    for (const signal of signals) {
      expect(
        Object.values(signal.evidence).every(
          (value) =>
            value === null ||
            ['string', 'number', 'boolean'].includes(typeof value),
        ),
      ).toBe(true);
    }
    expect(prioritize(signals).map((row) => row.score)).toEqual([76, 76, 76]);
    const triage = await attachTriage(prioritize(signals), async () => [], now);
    expect(
      triage.find(
        (row) =>
          row.signal.source === 'github-security' &&
          row.signal.fingerprint.includes('dependabot'),
      )?.followUp?.unassessedTargets,
    ).toEqual(['requirements.txt']);
  });
  it('empty complete inventories are healthy, but fixed/dismissed are not targets', async () => {
    const signals = await collectGithubSecuritySignals({
      config,
      now,
      fetchImpl: vi.fn<typeof fetch>(async () => new Response('[]')),
    });
    expect(signals.map((row) => row.status)).toEqual([
      'healthy',
      'healthy',
      'healthy',
    ]);
    expect(
      securityEvidence(
        'code-scanning',
        [codeScanningSchema.parse({ ...code, state: 'fixed' })],
        false,
      )['followUpTargets'],
    ).toBe('');
  });
  it.each([
    401,
    403,
    404,
    400,
    422,
    429,
    500,
    'rate',
    'retry',
    'timeout',
    'bad',
    'external',
  ])('isolates %s to its own surface', async (failure) => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (!String(url).includes('/dependabot/')) {
        return new Response(JSON.stringify(bodies[surface(String(url))]));
      }
      if (failure === 'timeout') {
        throw new DOMException('timeout', 'TimeoutError');
      }
      if (failure === 'bad') {
        return new Response('[{}]');
      }
      if (failure === 'external') {
        return new Response('[]', {
          headers: { link: '<https://evil.test>; rel="next"' },
        });
      }
      return new Response('{}', {
        status: typeof failure === 'number' ? failure : 403,
        headers:
          failure === 'rate'
            ? { 'x-ratelimit-remaining': '0' }
            : failure === 'retry'
              ? { 'retry-after': '1' }
              : {},
      });
    });
    const signals = await collectGithubSecuritySignals({
      config,
      now,
      fetchImpl,
    });
    expect(signals).toHaveLength(3);
    expect(signals[0]?.status).toBe('critical');
    expect(signals[2]?.status).toBe('critical');
    const unknown = [403, 404].includes(failure as number);
    expect(signals[1]?.status).toBe(unknown ? 'unknown' : 'degraded');
    expect(signals[1]?.fingerprint).toBe(
      unknown
        ? 'github-security:dependabot/repository'
        : 'github-security:source-failure/dependabot',
    );
    if (unknown) {
      expect(prioritize([signals[1]!])).toEqual([]);
    }
  });
  it('bounds targets and canonicalizes pip packages', async () => {
    const rows = Array.from({ length: 26 }, (_, number) =>
      dependabotSchema.parse({
        ...dependency,
        number: number + 1,
        dependency: {
          ...dependency.dependency,
          manifest_path: `apps/${number}/requirements.txt`,
          package: { name: number % 2 ? 'pillow' : 'Pillow', ecosystem: 'pip' },
        },
        security_vulnerability: {
          ...dependency.security_vulnerability,
          first_patched_version: null,
        },
      }),
    );
    const evidence = securityEvidence('dependabot', rows, false);
    expect(evidence['followUpTargets'].split(',')).toHaveLength(25);
    expect(evidence).toMatchObject({
      inventoryTruncated: true,
      packages: 1,
      unpatchedAlerts: 26,
    });
    const triage = await attachTriage(
      prioritize(
        await collectGithubSecuritySignals({
          config,
          now,
          fetchImpl: responding(),
        }),
      ).map((row) => ({ ...row, signal: { ...row.signal, evidence } })),
      async () => [],
      now,
    );
    expect(triage[0]?.followUp?.targetCoverage).toBe('partial');
  });
  it('uses status-only weight for degraded alerts and refuses healthy from a truncated empty inventory', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/dependabot/')
              ? [
                  {
                    ...dependency,
                    security_advisory: {
                      ...dependency.security_advisory,
                      severity: 'high',
                    },
                  },
                ]
              : [],
          ),
          {
            headers: {
              link: '<https://api.github.com/repos/zapPilot/zapEngine/dependabot/alerts?after=x>; rel="next"',
            },
          },
        ),
    );
    const signals = await collectGithubSecuritySignals({
      config,
      now,
      fetchImpl,
    });
    expect(signals[1]?.status).toBe('degraded');
    expect(prioritize([signals[1]!])[0]?.score).toBe(46);
  });
});

it('global fetch supports truncated empty inventories without inventing health', async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response('[]', {
        headers: {
          link: '<https://api.github.com/repos/zapPilot/zapEngine/code-scanning/alerts?page=3>; rel="next"',
        },
      }),
  );
  vi.stubGlobal('fetch', fetchImpl);
  try {
    const signals = await collectGithubSecuritySignals({ config, now });
    expect(signals.map((row) => row.status)).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  } finally {
    vi.unstubAllGlobals();
  }
});
