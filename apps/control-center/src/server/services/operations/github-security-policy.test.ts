import { describe, expect, it } from 'vitest';
import { code, dependency, secret } from './__fixtures__/github-security.js';
import {
  alertSeverity,
  alertStatus,
  codeScanningSchema,
  dependabotSchema,
  normalizedPackage,
  secretScanningSchema,
  severityOrder,
} from './github-security-policy.js';

describe('GitHub Security policy', () => {
  it.each(['critical', 'high', 'medium', 'low', null, undefined])(
    'code severity %s',
    (severity) => {
      const row = codeScanningSchema.parse({
        ...code,
        rule: { ...code.rule, security_severity_level: severity },
      });
      expect(alertStatus(row)).toBe(
        ['critical', 'high'].includes(severity ?? '') ? 'critical' : 'degraded',
      );
      expect(alertSeverity(row)).toBe(severity ?? 'unknown');
      expect(alertStatus({ ...row, state: 'fixed' })).toBe('healthy');
    },
  );
  it.each(['test', 'generated', 'library'])(
    'caps GitHub classification %s',
    (classification) => {
      expect(
        alertStatus(
          codeScanningSchema.parse({
            ...code,
            most_recent_instance: {
              ...code.most_recent_instance,
              classifications: [null, classification],
            },
          }),
        ),
      ).toBe('degraded');
    },
  );
  it('accepts missing classifications and severity', () => {
    const row = codeScanningSchema.parse({
      ...code,
      rule: { id: 'rule', description: 'description' },
      most_recent_instance: {
        ...code.most_recent_instance,
        classifications: undefined,
      },
    });
    expect(alertStatus(row)).toBe('degraded');
  });
  it.each(['critical', 'high', 'medium', 'low'])(
    'dependency severity %s',
    (severity) => {
      const row = dependabotSchema.parse({
        ...dependency,
        security_advisory: { ...dependency.security_advisory, severity },
      });
      expect(alertStatus(row)).toBe(
        severity === 'critical' ? 'critical' : 'degraded',
      );
      expect(alertStatus({ ...row, state: 'dismissed' })).toBe('healthy');
    },
  );
  it.each(['inactive', 'active', 'unknown', null, undefined])(
    'secret validity %s',
    (validity) => {
      const row = secretScanningSchema.parse({ ...secret, validity });
      expect(alertStatus(row)).toBe(
        validity === 'inactive' ? 'degraded' : 'critical',
      );
      expect(alertSeverity(row)).toBe(
        validity === 'inactive' ? 'low' : 'critical',
      );
      expect(alertStatus({ ...row, state: 'fixed' })).toBe('healthy');
      expect(JSON.stringify(row)).not.toContain(secret.secret);
      expect(row).not.toHaveProperty('secret');
    },
  );
  it('normalizes pip names only', () => {
    const row = dependabotSchema.parse(dependency);
    expect(
      normalizedPackage({
        ...row,
        dependency: {
          ...row.dependency,
          package: { name: 'A_B.C---D', ecosystem: 'pip' },
        },
      }),
    ).toBe('a-b-c-d');
    expect(
      normalizedPackage({
        ...row,
        dependency: {
          ...row.dependency,
          package: { name: 'ABC', ecosystem: 'npm' },
        },
      }),
    ).toBe('ABC');
    expect(severityOrder('critical')).toBe(0);
  });
});
