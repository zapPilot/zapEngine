import { expect, it, vi } from 'vitest';
import { readControlCenterConfig } from '../../../config/env.js';
import { code, dependency, secret } from '../__fixtures__/github-security.js';
import { inspectOperationalSignal } from './inspect.js';
const config = readControlCenterConfig({ OPS_GITHUB_TOKEN: 'test' });
const now = () => new Date('2026-10-04T00:00:00Z');
const inspect = (kind: string, fetchImpl: typeof fetch, settings = config) =>
  inspectOperationalSignal({
    config: settings,
    fingerprint: `github-security:${kind}`,
    fetchImpl,
    now,
  });
it('unsupported kinds and missing token make no requests', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const kind of [
    'code-scanning/1',
    'source-failure/code-scanning',
    'unconfigured/token',
    'other/repository',
  ]) {
    expect((await inspect(kind, fetchImpl)).status).toBe('unsupported');
  }
  const result = await inspect(
    'code-scanning/repository',
    fetchImpl,
    readControlCenterConfig({}),
  );
  expect(result.status).toBe('unavailable');
  expect(result.gaps[0]?.reason).toContain('OPS_GITHUB_TOKEN');
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('sorts and bounds CodeQL, excludes fixed rows, truncates messages and links workflows', async () => {
  const rows = [
    { ...code, number: 100, state: 'fixed' },
    ...Array.from({ length: 26 }, (_, i) => ({
      ...code,
      number: i + 1,
      rule: { ...code.rule, security_severity_level: i === 0 ? 'low' : 'high' },
      most_recent_instance: {
        ...code.most_recent_instance,
        location: {
          path: i === 1 ? 'src/main.ts' : '.github/workflows/ci.yml',
          start_line: i + 1,
        },
        classifications: i === 2 ? undefined : [null, 'test'],
      },
    })),
  ];
  const result = await inspect(
    'code-scanning/repository',
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(rows))),
  );
  expect(result.status).toBe('ok');
  const alerts = result.evidence['alerts'] as Array<{
    number: number;
    message: string;
  }>;
  expect(alerts).toHaveLength(25);
  expect(alerts[0]?.number).toBe(2);
  expect(alerts[0]?.message).toHaveLength(300);
  expect(result.entities.some((row) => row.type === 'github-workflow')).toBe(
    true,
  );
  expect(result.evidence['inventoryTruncated']).toBe(true);
});
it('groups manifests, canonical pip packages, advisories and highest patch', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    ...dependency,
    number: i + 1,
    dependency: {
      ...dependency.dependency,
      package: { name: i % 2 ? 'pillow' : 'Pillow', ecosystem: 'pip' },
    },
    security_advisory: {
      ...dependency.security_advisory,
      ghsa_id: `GHSA-${i}`,
      severity: i === 0 ? 'critical' : 'high',
    },
    security_vulnerability: {
      vulnerable_version_range: `<${i}`,
      first_patched_version: i === 0 ? null : { identifier: `${i}.0` },
    },
  }));
  rows.push({
    ...rows[0]!,
    number: 8,
    dependency: {
      ...dependency.dependency,
      manifest_path: 'other/requirements.txt',
    },
  });
  const result = await inspect(
    'dependabot/repository',
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(rows))),
  );
  expect(result.evidence['manifests']).toMatchObject([
    {
      manifest: 'requirements.txt',
      packages: [
        {
          package: 'pillow',
          alerts: 7,
          severity: 'critical',
          firstPatchedVersion: '6.0',
          unpatchedAlerts: 1,
        },
      ],
    },
    {
      manifest: 'other/requirements.txt',
      packages: [{ firstPatchedVersion: null }],
    },
  ]);
  const manifests = result.evidence['manifests'] as Array<{
    packages: Array<{ ghsa: string[]; vulnerableRanges: string[] }>;
  }>;
  expect(manifests[0]?.packages[0]?.ghsa).toHaveLength(5);
  expect(manifests[0]?.packages[0]?.vulnerableRanges).toHaveLength(3);
});
it('only exposes allowlisted secret metadata and hides secrets in GET requests', async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify([
        secret,
        {
          ...secret,
          number: 2,
          validity: null,
          push_protection_bypassed: null,
          publicly_leaked: null,
          first_location_detected: null,
        },
      ]),
    ),
  );
  const result = await inspect('secret-scanning/repository', fetchImpl);
  expect(JSON.stringify(result)).not.toContain(secret.secret);
  expect(result.evidence['alerts']).toMatchObject([
    {
      secretType: 'github_token',
      validity: 'unknown',
      firstLocation: { path: 'test.txt' },
    },
    { validity: 'unknown', firstLocation: null },
  ]);
  expect(fetchImpl.mock.calls[0]?.[0]).toContain('hide_secret=true');
  expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('GET');
  expect(fetchImpl.mock.calls[0]?.[1]?.body).toBeUndefined();
});
it.each([403, 404, 401, 500, 'bad', 'throw'])(
  'unavailable %s without payload leaks',
  async (status) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (status === 'throw') {
        throw new Error(secret.secret);
      }
      return new Response(status === 'bad' ? '[{}]' : '{}', {
        status: typeof status === 'number' ? status : 200,
      });
    });
    const result = await inspect('secret-scanning/repository', fetchImpl);
    expect(result.status).toBe('unavailable');
    expect(result.gaps).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(secret.secret);
    if (status === 403 || status === 404) {
      expect(result.gaps[0]?.reason).toContain('Secret scanning alerts: Read');
    }
  },
);
it('returns an empty readable inventory', async () => {
  const result = await inspect(
    'dependabot/repository',
    vi.fn<typeof fetch>().mockResolvedValue(new Response('[]')),
  );
  expect(result.status).toBe('ok');
  expect(result.evidence['manifests']).toEqual([]);
  expect(result.entities).toEqual([]);
});

it('rejects unknown source and a known source without an inspector', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const fingerprint of ['unknown:foo/bar', 'cost-ledger:provider/fly']) {
    const result = await inspectOperationalSignal({
      config,
      now,
      fetchImpl,
      fingerprint,
    });
    expect(result.status).toBe('unsupported');
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});
