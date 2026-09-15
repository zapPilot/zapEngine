import {
  formatChartAxisDate,
  formatChartDate,
  formatCurrencyAxis,
  formatSentiment,
} from '@core/utils/formatting/dateChart';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('chart formatters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Invariant: valid strings and Date instances use the same explicit US
  // tooltip format instead of relying on a host-specific default.
  it.each([
    ['2026-03-24T00:00:00.000Z'],
    [new Date('2026-03-24T00:00:00.000Z')],
  ])('formats a valid chart date %#', (value) => {
    const localeSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Mar 24, 2026');

    expect(formatChartDate(value)).toBe('Mar 24, 2026');
    expect(localeSpy).toHaveBeenCalledWith('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  // Invariant: invalid user-supplied strings remain visible for diagnosis,
  // while invalid Date objects never leak "Invalid Date" into the UI.
  it('handles both invalid date input shapes', () => {
    expect(formatChartDate('not-a-date')).toBe('not-a-date');
    expect(formatChartDate(new Date(Number.NaN))).toBe('');
  });

  // Invariant: axis dates request the compact month/two-digit-year shape.
  it('formats chart axis dates with compact options', () => {
    const localeSpy = vi
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockReturnValue('Mar 26');

    expect(formatChartAxisDate(1_774_310_400_000)).toBe('Mar 26');
    expect(localeSpy).toHaveBeenCalledWith(undefined, {
      month: 'short',
      year: '2-digit',
    });
  });

  // Invariant: currency-axis values are rounded to whole thousands after
  // accepting either numeric or serialized API values.
  it.each([
    [42_499, '$42k'],
    ['42500', '$43k'],
  ])('formats currency axis value %s', (value, expected) => {
    expect(formatCurrencyAxis(value)).toBe(expected);
  });

  // Invariant: only the three semantic sentiment anchors receive labels.
  it.each([
    [0, 'Fear'],
    [50, 'Neutral'],
    [100, 'Greed'],
    [73, '73'],
  ])('formats sentiment value %s', (value, expected) => {
    expect(formatSentiment(value)).toBe(expected);
  });
});
