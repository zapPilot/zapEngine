import * as fs from 'node:fs';

import { TemplateService } from '@modules/notifications/template.service';
import type { Mock } from 'vitest';

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
          '<html>{{CSS_STYLES}} {{USER_ID}} {{CURRENT_BALANCE}} {{SHORT_ADDRESS}}</html>',
        )
        .mockReturnValueOnce('.test { color: red; }');

      const result = service.generateReportHTML(
        'user-1',
        {
          currentBalance: 1000,
          estimatedYearlyROI: 12.5,
          estimatedYearlyPnL: 125,
          monthlyIncome: 10.42,
          weightedAPR: 5.2,
          walletCount: 2,
          recommendedPeriod: '30_days',
        },
        'user@test.com',
        'chart-cid-123',
        ['0x1234567890abcdef1234567890abcdef12345678'],
      );

      expect(result).toContain('user-1');
      expect(result).toContain('.test { color: red; }');
      expect(result).toContain('$1,000.00');
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
          monthlyIncome: 0,
          weightedAPR: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'a@b.com',
        'cid',
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
          monthlyIncome: 0,
          weightedAPR: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'a@b.com',
        'cid',
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
        monthlyIncome: 0,
        weightedAPR: 0,
        walletCount: 0,
        recommendedPeriod: '30_days',
      };

      // First call loads from disk
      service.generateReportHTML('u-1', baseMetrics, 'a@b.com', 'cid');
      const callsAfterFirst = mockReadFileSync.mock.calls.length;

      // Second call should use cache — readFileSync should NOT be called again
      service.generateReportHTML('u-2', baseMetrics, 'b@c.com', 'cid2');
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
          monthlyIncome: 0,
          weightedAPR: 0,
          walletCount: 0,
          recommendedPeriod: '',
        },
        'a@b.com',
        'cid',
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
          monthlyIncome: 0,
          weightedAPR: 0,
          walletCount: 0,
          recommendedPeriod: 'no_digits_here', // regex won't match
        },
        'a@b.com',
        'cid',
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
          monthlyIncome: 0,
          weightedAPR: 0,
          walletCount: 0,
          recommendedPeriod: '0_days', // days = 0 → days <= 0 → N/A
        },
        'a@b.com',
        'cid',
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
});
