import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatSnapshotDate, isSnapshotToday } from '@/lib/portfolioDates';

describe('portfolio snapshot dates', () => {
  it('uses today only when the snapshot date matches', () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    expect(isSnapshotToday('2026-08-22', now)).toBe(true);
    expect(isSnapshotToday('2026-08-21', now)).toBe(false);
    expect(isSnapshotToday(undefined, now)).toBe(false);
  });

  it('formats valid dates and leaves missing or invalid dates unavailable', () => {
    expect(formatSnapshotDate('2026-08-21', 'en')).toBe('Aug 21, 2026');
    expect(formatSnapshotDate(undefined, 'en')).toBeNull();
    expect(formatSnapshotDate('invalid', 'ja')).toBeNull();
  });
});

const OriginalDateTimeFormat = Intl.DateTimeFormat;

/**
 * `new` reaches the mock's implementation directly, and an arrow function is
 * not constructible — hence a declaration that forwards to the real
 * constructor captured above.
 */
function constructDateTimeFormat(
  ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
): Intl.DateTimeFormat {
  return new OriginalDateTimeFormat(...args);
}

function spyOnDateTimeFormat() {
  return vi
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation(constructDateTimeFormat);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The cache lives at module scope and the `en` case above has already warmed
 * its entry, so these use the two locales no other case in this file formats
 * with.
 */
describe('snapshot date formatter cache', () => {
  it('builds one formatter for repeated calls in the same locale', () => {
    const construct = spyOnDateTimeFormat();

    const labels = ['2026-08-21', '2026-08-22', '2026-08-23'].map((date) =>
      formatSnapshotDate(date, 'zh-Hant'),
    );

    expect(construct).toHaveBeenCalledTimes(1);
    expect(labels).toEqual(['2026年8月21日', '2026年8月22日', '2026年8月23日']);
  });

  it('builds a separate formatter per locale', () => {
    const construct = spyOnDateTimeFormat();

    // zh-Hant is already cached by the case above, so only ja is constructed.
    formatSnapshotDate('2026-08-21', 'zh-Hant');
    formatSnapshotDate('2026-08-21', 'ja');

    expect(construct).toHaveBeenCalledTimes(1);
  });
});
