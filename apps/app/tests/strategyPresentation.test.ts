import { describe, expect, it, vi } from 'vitest';

import {
  compositionRows,
  currentModeLabelFor,
} from '@/integration/strategyPresentation';

vi.mock('@zapengine/app-core/lib/domain/regime', () => ({
  getRegimeLabel: (id: string) => (id === 'risk_on' ? 'Risk on' : ''),
}));

describe('currentModeLabelFor', () => {
  it('labels a known live regime', () => {
    expect(currentModeLabelFor('risk_on')).toBe('Risk on');
  });

  it('renders a dash for a missing or unrecognised regime', () => {
    expect(currentModeLabelFor(null)).toBe('—');
    expect(currentModeLabelFor(undefined)).toBe('—');
    expect(currentModeLabelFor('unknown')).toBe('—');
  });
});

describe('compositionRows', () => {
  it('builds the three pillars from the live target, rounded to whole percents', () => {
    const target = { equities: 12.4, crypto: 33.6, stables: 54 };

    expect(compositionRows(target)).toEqual([
      expect.objectContaining({ label: 'Equities', pct: 12 }),
      expect.objectContaining({ label: 'Crypto', pct: 34 }),
      expect.objectContaining({ label: 'Stables', pct: 54 }),
    ]);
  });

  it('reads every pillar as 0% when no target is available', () => {
    const rows = compositionRows(null);

    expect(rows.map((row) => row.label)).toEqual([
      'Equities',
      'Crypto',
      'Stables',
    ]);
    expect(rows.map((row) => row.pct)).toEqual([0, 0, 0]);
    expect(rows.every((row) => typeof row.color === 'string')).toBe(true);
  });
});
