import { describe, expect, it } from 'vitest';

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
