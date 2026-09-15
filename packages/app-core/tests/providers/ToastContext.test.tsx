// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ToastContext, useToast } from '@core/providers/ToastContext';

describe('ToastContext', () => {
  it('returns the provider value', () => {
    const value = {
      showToast: vi.fn(),
      hideToast: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(ToastContext.Provider, { value }, children);

    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current).toBe(value);
  });

  it('throws outside a ToastProvider', () => {
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider',
    );
  });
});
