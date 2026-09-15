import { getChainName } from '@core/constants/chains';
import { getRegimeAllocation } from '@core/regime/regimeData';
import { findDailySuggestionSchemaIssues } from '@core/schemas/api/strategySchemas';
import { formatAddress } from '@core/utils/formatting/address';
import {
  normalizeFormatOptions,
  parseUtcDate,
} from '@core/utils/formatting/shared';
import { describe, expect, it } from 'vitest';

describe('pure coverage tail', () => {
  it('formats registered and unknown chain ids', () => {
    expect(getChainName(8453)).toBe('Base');
    expect(getChainName(999999)).toBe('Chain 999999');
  });

  it('handles missing, blank, and custom address formatting inputs', () => {
    expect(formatAddress(null)).toBe('');
    expect(formatAddress(undefined)).toBe('');
    expect(formatAddress('   ')).toBe('');
    expect(
      formatAddress(' 0x1111111111111111111111111111111111111111 ', {
        prefixLength: 4,
        suffixLength: 2,
        ellipsis: '...',
      }),
    ).toBe('0x11...11');
  });

  it('parses valid UTC dates and rejects invalid dates', () => {
    expect(parseUtcDate('2026-09-15T00:00:00Z')?.isValid()).toBe(true);
    expect(parseUtcDate('not-a-date')).toBeNull();
  });

  it('normalizes legacy boolean and object formatter options', () => {
    const defaults = { isHidden: false, smartPrecision: true };
    expect(normalizeFormatOptions(true, defaults)).toEqual({
      isHidden: true,
      smartPrecision: true,
    });
    expect(
      normalizeFormatOptions(
        { isHidden: false, smartPrecision: false },
        defaults,
      ),
    ).toEqual({ isHidden: false, smartPrecision: false });
  });

  it('uses fromLeft allocation when default strategy is absent', () => {
    expect(
      getRegimeAllocation({
        id: 'n',
        strategies: {
          default: undefined,
          fromLeft: {
            useCase: { allocationAfter: { spot: 0.4, stable: 0.6 } },
          },
        },
      } as never),
    ).toEqual({ spot: 0.4, stable: 0.6 });
  });

  it('throws when a regime has no usable allocation strategy', () => {
    expect(() =>
      getRegimeAllocation({
        id: 'broken',
        strategies: { default: undefined, fromLeft: undefined },
      } as never),
    ).toThrow('No valid strategy found for regime broken');
  });

  it('labels root-level strategy schema failures explicitly', () => {
    const issues = findDailySuggestionSchemaIssues(null);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => issue.path === '<root>')).toBe(true);
  });
});
