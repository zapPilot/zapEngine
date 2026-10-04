import { z } from 'zod';
import type { OperationalStatus } from '../../../shared/types.js';

const severity = z.enum(['critical', 'high', 'medium', 'low']);
const common = {
  number: z.number().int().positive(),
  state: z.string(),
  html_url: z.string(),
  created_at: z.string(),
};
export const codeScanningSchema = z.object({
  ...common,
  rule: z.object({
    id: z.string(),
    description: z.string(),
    security_severity_level: severity.nullish(),
    severity: z.string().nullish(),
  }),
  tool: z.object({ name: z.string() }),
  most_recent_instance: z.object({
    classifications: z.array(z.string().nullable()).nullish(),
    location: z.object({ path: z.string(), start_line: z.number().nullish() }),
    message: z.object({ text: z.string() }),
  }),
});
export const dependabotSchema = z.object({
  ...common,
  dependency: z.object({
    package: z.object({ name: z.string(), ecosystem: z.string() }),
    manifest_path: z.string(),
  }),
  security_advisory: z.object({
    ghsa_id: z.string(),
    summary: z.string(),
    severity,
  }),
  security_vulnerability: z.object({
    vulnerable_version_range: z.string(),
    first_patched_version: z.object({ identifier: z.string() }).nullable(),
  }),
});
// Unknown keys (including secret) are stripped before anything leaves the adapter.
export const secretScanningSchema = z.object({
  ...common,
  secret_type: z.string(),
  secret_type_display_name: z.string(),
  validity: z.string().nullish(),
  push_protection_bypassed: z.boolean().nullish(),
  publicly_leaked: z.boolean().nullish(),
  first_location_detected: z
    .object({
      path: z.string().nullish(),
      start_line: z.number().nullish(),
      commit_sha: z.string().nullish(),
    })
    .nullish(),
});
export const SECURITY_SURFACES = [
  'code-scanning',
  'dependabot',
  'secret-scanning',
] as const;
export type SecuritySurface = (typeof SECURITY_SURFACES)[number];
export type CodeAlert = z.infer<typeof codeScanningSchema>;
export type DependencyAlert = z.infer<typeof dependabotSchema>;
export type SecretAlert = z.infer<typeof secretScanningSchema>;
export type SecurityAlert = CodeAlert | DependencyAlert | SecretAlert;

export function alertSeverity(alert: SecurityAlert): string {
  if ('rule' in alert) {
    return alert.rule.security_severity_level ?? 'unknown';
  }
  if ('security_advisory' in alert) {
    return alert.security_advisory.severity;
  }
  return alert.validity === 'inactive' ? 'low' : 'critical';
}
export function alertStatus(alert: SecurityAlert): OperationalStatus {
  if (alert.state !== 'open') {
    return 'healthy';
  }
  if ('rule' in alert) {
    const classified = alert.most_recent_instance.classifications?.some(
      (value) => ['test', 'generated', 'library'].includes(value ?? ''),
    );
    return !classified && ['critical', 'high'].includes(alertSeverity(alert))
      ? 'critical'
      : 'degraded';
  }
  if ('security_advisory' in alert) {
    return alertSeverity(alert) === 'critical' ? 'critical' : 'degraded';
  }
  return alert.validity === 'inactive' ? 'degraded' : 'critical';
}
export function normalizedPackage(alert: DependencyAlert): string {
  const { name, ecosystem } = alert.dependency.package;
  return ecosystem === 'pip'
    ? name.toLowerCase().replace(/[-_.]+/g, '-')
    : name;
}
export function severityOrder(value: string): number {
  return ['critical', 'high', 'medium', 'low', 'unknown'].indexOf(value);
}
