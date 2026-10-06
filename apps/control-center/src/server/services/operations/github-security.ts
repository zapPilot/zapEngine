import type { ControlCenterConfig } from '../../config/env.js';
import { githubAccessUnavailable, githubPages, REPO } from './github-api.js';
import {
  SECURITY_SURFACES,
  codeScanningSchema,
  dependabotSchema,
  secretScanningSchema,
  alertSeverity,
  alertStatus,
  normalizedPackage,
  type SecurityAlert,
  type SecuritySurface,
} from './github-security-policy.js';
import {
  buildSignal,
  collectOrFail,
  sourceFailure,
  unknownSignal,
  worstOf,
} from './signal.js';

export const SECURITY_PERMISSIONS: Record<SecuritySurface, string> = {
  'code-scanning': 'Code scanning alerts: Read',
  dependabot: 'Dependabot alerts: Read',
  'secret-scanning': 'Secret scanning alerts: Read',
};
export async function readSecuritySurface(
  surface: SecuritySurface,
  token: string,
  fetchImpl: typeof fetch,
) {
  const input = {
    token,
    fetchImpl,
    path: `${surface}/alerts?state=open&per_page=100${surface === 'secret-scanning' ? '&hide_secret=true' : ''}`,
    label: `GitHub ${surface} alerts`,
  };
  switch (surface) {
    case 'code-scanning':
      return githubPages({ ...input, schema: codeScanningSchema });
    case 'dependabot':
      return githubPages({ ...input, schema: dependabotSchema });
    default:
      return githubPages({ ...input, schema: secretScanningSchema });
  }
}
export function securityEvidence(
  surface: SecuritySurface,
  rows: SecurityAlert[],
  truncated: boolean,
) {
  const open = rows.filter((row) => row.state === 'open');
  const targets = [
    ...new Set(
      open.map((row) =>
        'dependency' in row ? row.dependency.manifest_path : String(row.number),
      ),
    ),
  ];
  const counts: Record<string, number> = Object.fromEntries(
    ['critical', 'high', 'medium', 'low', 'unknown'].map((severity) => [
      severity,
      open.filter((row) => alertSeverity(row) === severity).length,
    ]),
  );
  const dependencies = open.filter((row) => 'dependency' in row);
  return {
    surface,
    openAlerts: open.length,
    ...counts,
    followUpTargets: targets.slice(0, 25).join(','),
    inventoryTruncated: truncated || targets.length > 25,
    ...(surface === 'dependabot'
      ? {
          manifests: targets.length,
          packages: new Set(
            dependencies.map(
              (row) =>
                `${row.dependency.package.ecosystem}:${normalizedPackage(row)}`,
            ),
          ).size,
          unpatchedAlerts: dependencies.filter(
            (row) => row.security_vulnerability.first_patched_version === null,
          ).length,
        }
      : {}),
  };
}
export async function collectGithubSecuritySignals(input: {
  config: ControlCenterConfig;
  now: Date;
  fetchImpl?: typeof fetch;
}) {
  const origin = { source: 'github-security', domain: 'security' } as const;
  return collectOrFail(origin, input.now, async () => {
    const token = input.config.OPS_GITHUB_TOKEN;
    if (!token) {
      return [
        unknownSignal({
          ...origin,
          key: 'token',
          title: 'GitHub Security is unconfigured',
          detail: 'OPS_GITHUB_TOKEN is unset.',
          observedAt: input.now,
        }),
      ];
    }
    return Promise.all(
      SECURITY_SURFACES.map(async (surface) => {
        try {
          const { rows, truncated } = await readSecuritySurface(
            surface,
            token,
            input.fetchImpl ?? globalThis.fetch,
          );
          const open = rows.filter((row) => row.state === 'open');
          const evidence = securityEvidence(surface, open, truncated);
          const status = open.length
            ? worstOf(open.map(alertStatus))
            : truncated
              ? 'unknown'
              : 'healthy';
          const detail = open
            .filter((row) => alertStatus(row) === 'critical')
            .map((row) =>
              'dependency' in row
                ? `${normalizedPackage(row)} (${row.dependency.manifest_path})`
                : 'rule' in row
                  ? row.rule.id
                  : row.secret_type_display_name,
            )
            .join('; ')
            .slice(0, 200);
          return buildSignal({
            ...origin,
            kind: surface,
            key: 'repository',
            status,
            title: `${surface}: ${evidence.openAlerts} open alerts (${open.filter((row) => alertSeverity(row) === 'critical').length} critical, ${open.filter((row) => alertSeverity(row) === 'high').length} high)`,
            detail:
              detail || (truncated ? 'Alert inventory is truncated.' : null),
            evidence,
            observedAt: input.now,
            url: `https://github.com/${REPO}/security/${surface === 'code-scanning' ? 'code-scanning' : surface}`,
          });
        } catch (error) {
          const evidence = securityEvidence(surface, [], false);
          if (githubAccessUnavailable(error)) {
            return buildSignal({
              ...origin,
              kind: surface,
              key: 'repository',
              status: 'unknown',
              title: `${surface}: unavailable`,
              detail: `Requires ${SECURITY_PERMISSIONS[surface]} and an enabled surface.`,
              evidence: { ...evidence, openAlerts: null },
              observedAt: input.now,
            });
          }
          return sourceFailure({
            ...origin,
            key: surface,
            error:
              'GitHub Security alert inventory could not be read or validated.',
            evidence: { ...evidence, openAlerts: null },
            observedAt: input.now,
          });
        }
      }),
    );
  });
}
