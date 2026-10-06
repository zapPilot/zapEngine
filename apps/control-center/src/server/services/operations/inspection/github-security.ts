import { githubAccessUnavailable } from '../github-api.js';
import {
  alertSeverity,
  normalizedPackage,
  SECURITY_SURFACES,
  severityOrder,
  type DependencyAlert,
  type SecurityAlert,
  type SecuritySurface,
} from '../github-security-policy.js';
import {
  readSecuritySurface,
  SECURITY_PERMISSIONS,
} from '../github-security.js';
import {
  unavailableInspection,
  unsupportedInspection,
  type InspectorInput,
} from './result.js';
import type { OperationalEntityRef, SignalInspection } from './types.js';

function dependencyGroups(rows: DependencyAlert[]) {
  const manifests = new Map<string, Map<string, DependencyAlert[]>>();
  for (const row of rows) {
    const manifest = row.dependency.manifest_path;
    const packages =
      manifests.get(manifest) ?? new Map<string, DependencyAlert[]>();
    const key = `${row.dependency.package.ecosystem}:${normalizedPackage(row)}`;
    packages.set(key, [...(packages.get(key) ?? []), row]);
    manifests.set(manifest, packages);
  }
  return [...manifests].slice(0, 25).map(([manifest, packages]) => ({
    manifest,
    packages: [...packages.values()].slice(0, 25).map((alerts) => {
      const first = alerts[0]!;
      const patched = alerts
        .flatMap((row) =>
          row.security_vulnerability.first_patched_version
            ? [row.security_vulnerability.first_patched_version.identifier]
            : [],
        )
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      return {
        package: normalizedPackage(first),
        ecosystem: first.dependency.package.ecosystem,
        alerts: alerts.length,
        severity: alerts
          .map(alertSeverity)
          .sort((a, b) => severityOrder(a) - severityOrder(b))[0],
        firstPatchedVersion: patched.at(-1) ?? null,
        unpatchedAlerts: alerts.filter(
          (row) => !row.security_vulnerability.first_patched_version,
        ).length,
        ghsa: [
          ...new Set(alerts.map((row) => row.security_advisory.ghsa_id)),
        ].slice(0, 5),
        vulnerableRanges: [
          ...new Set(
            alerts.map(
              (row) => row.security_vulnerability.vulnerable_version_range,
            ),
          ),
        ].slice(0, 3),
      };
    }),
  }));
}
function inspectionRow(row: Exclude<SecurityAlert, DependencyAlert>) {
  const base = {
    number: row.number,
    createdAt: row.created_at,
    url: row.html_url,
  };
  if ('rule' in row) {
    return {
      ...base,
      rule: row.rule,
      tool: row.tool.name,
      location: row.most_recent_instance.location,
      classifications: row.most_recent_instance.classifications ?? [],
      message: row.most_recent_instance.message.text.slice(0, 300),
    };
  }
  return {
    ...base,
    secretType: row.secret_type,
    secretTypeName: row.secret_type_display_name,
    validity: row.validity ?? 'unknown',
    pushProtectionBypassed: row.push_protection_bypassed ?? null,
    publiclyLeaked: row.publicly_leaked ?? null,
    firstLocation: row.first_location_detected ?? null,
  };
}
export async function inspectGithubSecuritySignal(
  input: InspectorInput,
): Promise<SignalInspection> {
  const base = {
    fingerprint: input.fingerprint,
    source: 'github-security' as const,
    inspectedAt: input.inspectedAt,
  };
  if (
    input.parsed.key !== 'repository' ||
    !SECURITY_SURFACES.some((surface) => surface === input.parsed.kind)
  ) {
    return unsupportedInspection({
      ...base,
      summary:
        'GitHub Security inspection supports only surface/repository rollups.',
    });
  }
  const surface = input.parsed.kind as SecuritySurface;
  const token = input.config.OPS_GITHUB_TOKEN;
  if (!token) {
    return unavailableInspection({
      ...base,
      summary: 'GitHub Security inspection is unavailable.',
      reason: 'OPS_GITHUB_TOKEN is unset.',
    });
  }
  try {
    const { rows, truncated } = await readSecuritySurface(
      surface,
      token,
      input.fetchImpl,
    );
    const open = rows
      .filter((row) => row.state === 'open')
      .sort(
        (a, b) =>
          severityOrder(alertSeverity(a)) - severityOrder(alertSeverity(b)) ||
          a.number - b.number,
      );
    const bounded = open.slice(0, 25);
    const entities: OperationalEntityRef[] = bounded.map((row) => ({
      type: 'github-security-alert',
      id: `${surface}/${row.number}`,
      url: row.html_url,
    }));
    for (const row of bounded) {
      if (
        'rule' in row &&
        row.most_recent_instance.location.path.startsWith('.github/workflows/')
      ) {
        entities.push({
          type: 'github-workflow',
          id: row.most_recent_instance.location.path.slice(
            '.github/workflows/'.length,
          ),
        });
      }
    }
    return {
      ...base,
      inspectedAt: input.inspectedAt.toISOString(),
      status: 'ok',
      summary: `${surface}: ${open.length} open alerts.`,
      entities,
      evidence: {
        surface,
        inventoryTruncated: truncated || open.length > 25,
        ...(surface === 'dependabot'
          ? {
              manifests: dependencyGroups(
                open.filter((row) => 'dependency' in row),
              ),
            }
          : {
              alerts: bounded
                .filter(
                  (row): row is Exclude<SecurityAlert, DependencyAlert> =>
                    !('dependency' in row),
                )
                .map(inspectionRow),
            }),
      },
      gaps: [],
    };
  } catch (error) {
    const reason = githubAccessUnavailable(error)
      ? `Requires ${SECURITY_PERMISSIONS[surface]} and an enabled surface.`
      : 'GitHub Security alert inventory could not be read or validated.';
    return unavailableInspection({
      ...base,
      summary: `${surface}: unavailable`,
      reason,
    });
  }
}
