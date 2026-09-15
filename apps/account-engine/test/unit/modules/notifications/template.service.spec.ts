import * as fs from 'node:fs';

import type { Mock } from 'vitest';

import {
  type EmailMetrics,
  TemplateService,
} from '../../../../src/modules/notifications/template.service';

vi.mock('node:fs');

const mockReadFileSync = fs.readFileSync as Mock;

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    service = new TemplateService();
    service.clearTemplateCache();
    mockReadFileSync.mockReset();
  });

  describe('generateReportHTML', () => {
    it('replaces template placeholders with actual values', () => {
      mockReadFileSync
        .mockReturnValueOnce(
          '<html>{{CSS_STYLES}} {{USER_ID}} {{CURRENT_BALANCE}} {{SHORT_ADDRESS}} {{UNSUBSCRIBE_URL}}</html>',
        )
        .mockReturnValueOnce('.test { color: red; }');

      const result = service.generateReportHTML(
        'user-1',
        {
          currentBalance: 1000,
          estimatedYearlyROI: 12.5,
          estimatedYearlyPnL: 125,
          walletCount: 2,
          recommendedPeriod: '30_days',
        },
        'chart-cid-123',
        'https://app.example.com/unsubscribe?token=signed',
        ['0x1234567890abcdef1234567890abcdef12345678'],
      );

      expect(result).toContain('user-1');
      expect(result).toContain('.test { color: red; }');
      expect(result).toContain('$1,000.00');
      expect(result).toContain(
        'https://app.example.com/unsubscribe?token=signed',
      );
    });

    it('returns empty string when template file not found', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = service.generateReportHTML(
        'user-1',
        {
          currentBalance: 0,
          estimatedYearlyROI: 0,
          estimatedYearlyPnL: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toBe('');
    });

    it('uses first valid wallet as primary address', () => {
      mockReadFileSync
        .mockReturnValueOnce('{{ADDRESS}}')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        {
          currentBalance: 0,
          estimatedYearlyROI: 0,
          estimatedYearlyPnL: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
        ['unknown', '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'],
      );

      expect(result).toContain('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12');
    });
  });

  describe('generateReportHTML template caching', () => {
    it('uses cached template on second call (no additional fs.readFileSync calls)', () => {
      mockReadFileSync
        .mockReturnValueOnce('<html>{{CSS_STYLES}}</html>')
        .mockReturnValueOnce('.css {}');

      const baseMetrics = {
        currentBalance: 0,
        estimatedYearlyROI: 0,
        estimatedYearlyPnL: 0,
        walletCount: 0,
        recommendedPeriod: '30_days',
      };

      // First call loads from disk
      service.generateReportHTML(
        'u-1',
        baseMetrics,
        'cid',
        'https://app.example.com/unsubscribe?token=one',
      );
      const callsAfterFirst = mockReadFileSync.mock.calls.length;

      // Second call should use cache — readFileSync should NOT be called again
      service.generateReportHTML(
        'u-2',
        baseMetrics,
        'cid2',
        'https://app.example.com/unsubscribe?token=two',
      );
      expect(mockReadFileSync.mock.calls.length).toBe(callsAfterFirst);
    });

    it('returns first address as fallback when no valid wallet address found', () => {
      mockReadFileSync
        .mockReturnValueOnce('{{SHORT_ADDRESS}}')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        {
          currentBalance: 0,
          estimatedYearlyROI: 0,
          estimatedYearlyPnL: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
        ['non-wallet-address'], // no valid wallet → fallback to addresses[0]
      );

      expect(result).toContain('non-wallet-address');
    });

    it('handles recommendedPeriod with no digits (returns N/A)', () => {
      mockReadFileSync
        .mockReturnValueOnce('{{TOTAL_DAYS_ANALYZED}}')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        {
          currentBalance: 0,
          estimatedYearlyROI: 0,
          estimatedYearlyPnL: 0,
          walletCount: 0,
          recommendedPeriod: 'no_digits_here', // regex won't match
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toContain('N/A');
    });

    it('handles recommendedPeriod with zero days (returns N/A)', () => {
      mockReadFileSync
        .mockReturnValueOnce('{{TOTAL_DAYS_ANALYZED}}')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        {
          currentBalance: 0,
          estimatedYearlyROI: 0,
          estimatedYearlyPnL: 0,
          walletCount: 0,
          recommendedPeriod: '0_days', // days = 0 → days <= 0 → N/A
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toContain('N/A');
    });
  });

  describe('calculateRiskScore', () => {
    it('returns Low for < 5%', () => {
      expect(service.calculateRiskScore(3)).toBe('Low');
    });

    it('returns Medium for < 15%', () => {
      expect(service.calculateRiskScore(10)).toBe('Medium');
    });

    it('returns High for < 30%', () => {
      expect(service.calculateRiskScore(20)).toBe('High');
    });

    it('returns Very High for >= 30%', () => {
      expect(service.calculateRiskScore(35)).toBe('Very High');
    });
  });

  describe('branch sweep', () => {
    // Each test names the previously-uncovered branch it locks.
    // mutation: not run (offline sandbox — vitest could not be executed here).

    beforeEach(() => {
      service = new TemplateService();
      service.clearTemplateCache();
      mockReadFileSync.mockReset();
    });

    it('locks leaving unknown placeholders untouched', () => {
      // Locks: interpolateTemplate `hasOwnProperty(...)` false outcome.
      mockReadFileSync
        .mockReturnValueOnce('<p>{{UNKNOWN_PLACEHOLDER}}</p>')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        baseMetrics(),
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toContain('{{UNKNOWN_PLACEHOLDER}}');
    });

    it('locks the N/A fallback when no addresses are supplied at all', () => {
      // Locks: pickPrimaryAddress `addresses.length > 0` false outcome.
      mockReadFileSync
        .mockReturnValueOnce('{{ADDRESS}}')
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        baseMetrics(),
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
        [],
      );

      expect(result).toContain('N/A');
    });

    it('locks negative trend classes and signed percentages', () => {
      // Locks: getTrendClass `value < 0` true; formatPercentage `value > 0`
      // false outcome.
      mockReadFileSync
        .mockReturnValueOnce(
          '{{PNL_HERO_CLASS}}|{{APR_CLASS}}|{{ESTIMATED_APR}}|{{WEEKLY_PNL_CLASS}}|{{WEEKLY_PNL}}|{{WEEKLY_PNL_PERCENTAGE}}',
        )
        .mockReturnValueOnce('');

      const result = service.generateReportHTML(
        'u-1',
        {
          currentBalance: 1000,
          estimatedYearlyROI: -5,
          estimatedYearlyPnL: -50,
          walletCount: 1,
          recommendedPeriod: '30_days',
        },
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toBe('negative|negative|-5.00%|negative|-$50.00|-5.00%');
    });

    it('locks the non-number metric fallback to zero', () => {
      // Locks: toNumber `typeof value === 'number' ? value : 0` false outcome.
      // Reachable because PortfolioResponse is an unvalidated upstream
      // interface — a malformed analytics payload can surface undefined values.
      mockReadFileSync
        .mockReturnValueOnce('{{CURRENT_BALANCE}} {{ESTIMATED_APR}}')
        .mockReturnValueOnce('');
      const metrics = {
        currentBalance: undefined,
        estimatedYearlyROI: undefined,
        estimatedYearlyPnL: 0,
        walletCount: 1,
        recommendedPeriod: '30_days',
      } as unknown as EmailMetrics;

      const result = service.generateReportHTML(
        'u-1',
        metrics,
        'cid',
        'https://app.example.com/unsubscribe?token=signed',
      );

      expect(result).toContain('$0.00');
      expect(result).toContain('0.00%');
    });
  });
});

function baseMetrics(): EmailMetrics {
  return {
    currentBalance: 1000,
    estimatedYearlyROI: 12.5,
    estimatedYearlyPnL: 125,
    walletCount: 2,
    recommendedPeriod: '30_days',
  };
}
