import { describe, expect, it, vi } from 'vitest';

import {
  compositionRows,
  currentModeLabelFor,
  demoTextOrDash,
  liveNumberOrDemo,
  liveTextOrDemo,
  regimeDisplayFromRegime,
} from '@/integration/strategyPresentation';

vi.mock('@zapengine/app-core/lib/domain/regime', () => ({
  getRegimeLabel: (id: string) => (id === 'risk_on' ? 'Risk on' : `Mode ${id}`),
}));

describe('strategy presentation fallbacks', () => {
  it('prefers valid live numbers and otherwise distinguishes demo from unavailable', () => {
    expect(liveNumberOrDemo(0, 42, true)).toBe(0);
    expect(liveNumberOrDemo('42', 42, true)).toBe(42);
    expect(liveNumberOrDemo(undefined, 42, false)).toBeNull();
  });

  it('preserves live text, demo text, and connected dashes', () => {
    expect(liveTextOrDemo('', 'demo', true)).toBe('');
    expect(liveTextOrDemo(null, 'demo', true)).toBe('demo');
    expect(liveTextOrDemo(undefined, 'demo', false)).toBe('—');
    expect(demoTextOrDash('demo', true)).toBe('demo');
    expect(demoTextOrDash('demo', false)).toBe('—');
    expect(demoTextOrDash('demo', false, 'custom')).toBe('custom');
  });

  it('maps live, demo, and unavailable regime labels independently', () => {
    expect(regimeDisplayFromRegime('risk_on', 'Demo mode', false)).toEqual({
      regimeLabel: 'Risk on',
      marketModeLabel: 'Market mode · Risk on',
    });
    expect(regimeDisplayFromRegime(null, 'Demo mode', true)).toEqual({
      regimeLabel: '',
      marketModeLabel: 'Demo mode',
    });
    expect(regimeDisplayFromRegime(undefined, 'Demo mode', false)).toEqual({
      regimeLabel: '',
      marketModeLabel: 'Market mode · —',
    });
    expect(currentModeLabelFor('Risk on', 'Demo mode', false)).toBe('Risk on');
    expect(currentModeLabelFor('', 'Demo mode', true)).toBe('Demo mode');
    expect(currentModeLabelFor('', 'Demo mode', false)).toBe('—');
  });
});

describe('compositionRows', () => {
  const demoRows = [{ label: 'Demo', color: 'demo', weight: 99 }];

  it('builds live rows with exact or rounded target values', () => {
    const target = { equities: 12.4, crypto: 33.6, stables: 54 };

    expect(
      compositionRows(target, demoRows, false, { valueKey: 'weight' }),
    ).toEqual([
      expect.objectContaining({ label: 'Equities', weight: 12.4 }),
      expect.objectContaining({ label: 'Crypto', weight: 33.6 }),
      expect.objectContaining({ label: 'Stables', weight: 54 }),
    ]);
    expect(
      compositionRows(target, demoRows, false, {
        valueKey: 'weight',
        round: true,
      }).map((row) => row.weight),
    ).toEqual([12, 34, 54]);
  });

  it('returns demo rows unchanged and connected empty rows as zeroes', () => {
    expect(compositionRows(null, demoRows, true, { valueKey: 'weight' })).toBe(
      demoRows,
    );
    expect(
      compositionRows(null, demoRows, false, { valueKey: 'weight' }).map(
        (row) => row.weight,
      ),
    ).toEqual([0, 0, 0]);
  });
});
