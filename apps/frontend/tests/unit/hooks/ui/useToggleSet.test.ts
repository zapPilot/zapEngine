import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useToggleSet } from '@/hooks/ui/useToggleSet';

describe('useToggleSet', () => {
  it('initializes from an iterable value', () => {
    const { result } = renderHook(() =>
      useToggleSet({ initialValue: ['btc', 'eth'] }),
    );

    expect([...result.current.activeSet]).toEqual(['btc', 'eth']);
    expect(result.current.has('btc')).toBe(true);
    expect(result.current.has('sol')).toBe(false);
  });

  it('toggles values in and out of the active set', () => {
    const { result } = renderHook(() =>
      useToggleSet({ initialValue: ['btc'] }),
    );

    act(() => {
      result.current.toggle('eth');
    });
    expect([...result.current.activeSet]).toEqual(['btc', 'eth']);
    expect(result.current.has('eth')).toBe(true);

    act(() => {
      result.current.toggle('btc');
    });
    expect([...result.current.activeSet]).toEqual(['eth']);
    expect(result.current.has('btc')).toBe(false);
  });
});
