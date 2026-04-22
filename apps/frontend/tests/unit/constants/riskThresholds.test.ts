import { describe, expect, it } from 'vitest';

import {
  getRiskConfig,
  getRiskLevel,
  mapBorrowingStatusToRiskLevel,
  RISK_DISPLAY_CONFIG,
  RiskLevel,
} from '@/constants/riskThresholds';

describe('riskThresholds', () => {
  describe('RiskLevel', () => {
    it('has four levels', () => {
      expect(RiskLevel.SAFE).toBe('SAFE');
      expect(RiskLevel.MODERATE).toBe('MODERATE');
      expect(RiskLevel.RISKY).toBe('RISKY');
      expect(RiskLevel.CRITICAL).toBe('CRITICAL');
    });
  });

  describe('RISK_DISPLAY_CONFIG', () => {
    it('has config for each risk level', () => {
      expect(RISK_DISPLAY_CONFIG.SAFE.label).toBe('Safe');
      expect(RISK_DISPLAY_CONFIG.MODERATE.label).toBe('Moderate');
      expect(RISK_DISPLAY_CONFIG.RISKY.label).toBe('Risky');
      expect(RISK_DISPLAY_CONFIG.CRITICAL.label).toBe('Critical');
    });

    it('has pulse pattern for risky and critical', () => {
      expect(RISK_DISPLAY_CONFIG.RISKY.pattern).toBe('pulse');
      expect(RISK_DISPLAY_CONFIG.CRITICAL.pattern).toBe('pulse');
    });

    it('has solid pattern for safe and moderate', () => {
      expect(RISK_DISPLAY_CONFIG.SAFE.pattern).toBe('solid');
      expect(RISK_DISPLAY_CONFIG.MODERATE.pattern).toBe('solid');
    });
  });

  describe('getRiskLevel', () => {
    it('returns SAFE for healthRate >= 2.0', () => {
      expect(getRiskLevel(2.0)).toBe(RiskLevel.SAFE);
      expect(getRiskLevel(3.5)).toBe(RiskLevel.SAFE);
    });

    it('returns MODERATE for healthRate >= 1.5 and < 2.0', () => {
      expect(getRiskLevel(1.5)).toBe(RiskLevel.MODERATE);
      expect(getRiskLevel(1.9)).toBe(RiskLevel.MODERATE);
    });

    it('returns RISKY for healthRate >= 1.2 and < 1.5', () => {
      expect(getRiskLevel(1.2)).toBe(RiskLevel.RISKY);
      expect(getRiskLevel(1.4)).toBe(RiskLevel.RISKY);
    });

    it('returns CRITICAL for healthRate < 1.2', () => {
      expect(getRiskLevel(1.1)).toBe(RiskLevel.CRITICAL);
      expect(getRiskLevel(0.5)).toBe(RiskLevel.CRITICAL);
      expect(getRiskLevel(0)).toBe(RiskLevel.CRITICAL);
    });
  });

  describe('getRiskConfig', () => {
    it('returns full config for each risk level', () => {
      const safe = getRiskConfig(2.5);
      expect(safe.level).toBe(RiskLevel.SAFE);
      expect(safe.label).toBe('Safe');
      expect(safe.emoji).toBe('🟢');
      expect(safe.colors).toBe(RISK_DISPLAY_CONFIG.SAFE);

      const critical = getRiskConfig(1.0);
      expect(critical.level).toBe(RiskLevel.CRITICAL);
      expect(critical.label).toBe('Critical');
    });
  });

  describe('mapBorrowingStatusToRiskLevel', () => {
    it('maps HEALTHY to SAFE', () => {
      expect(mapBorrowingStatusToRiskLevel('HEALTHY')).toBe(RiskLevel.SAFE);
    });

    it('maps WARNING to RISKY', () => {
      expect(mapBorrowingStatusToRiskLevel('WARNING')).toBe(RiskLevel.RISKY);
    });

    it('maps CRITICAL to CRITICAL', () => {
      expect(mapBorrowingStatusToRiskLevel('CRITICAL')).toBe(
        RiskLevel.CRITICAL,
      );
    });

    it('maps unknown status to MODERATE (default)', () => {
      expect(mapBorrowingStatusToRiskLevel('UNKNOWN' as 'HEALTHY')).toBe(
        RiskLevel.MODERATE,
      );
    });
  });
});
