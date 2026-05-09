import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useClickOutside } from '@/hooks/ui/useClickOutside';

function createElementRef(): RefObject<HTMLDivElement | null> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return { current: element };
}

describe('useClickOutside', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('calls the handler for mousedown events outside the referenced element', () => {
    const ref = createElementRef();
    const onClickOutside = vi.fn();

    renderHook(() => useClickOutside(ref, onClickOutside));

    document.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
      }),
    );

    expect(onClickOutside).toHaveBeenCalledOnce();
  });

  it('ignores mousedown events inside the referenced element', () => {
    const ref = createElementRef();
    const onClickOutside = vi.fn();

    renderHook(() => useClickOutside(ref, onClickOutside));

    ref.current?.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
      }),
    );

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it('supports Escape-key dismissal when enabled', () => {
    const ref = createElementRef();
    const onClickOutside = vi.fn();

    renderHook(() => useClickOutside(ref, onClickOutside));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClickOutside).toHaveBeenCalledOnce();
  });

  it('does not install listeners when inactive', () => {
    const ref = createElementRef();
    const onClickOutside = vi.fn();

    renderHook(() => useClickOutside(ref, onClickOutside, false));

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClickOutside).not.toHaveBeenCalled();
  });

  it('can disable Escape-key handling', () => {
    const ref = createElementRef();
    const onClickOutside = vi.fn();

    renderHook(() =>
      useClickOutside(ref, onClickOutside, true, {
        enableEscapeKey: false,
      }),
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onClickOutside).not.toHaveBeenCalled();
  });
});
