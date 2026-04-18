import { renderHook } from '@testing-library/react';
import { useKeyboardNavigation } from '../useKeyboardNavigation';
import { createRef } from 'react';

describe('useKeyboardNavigation', () => {
  const mockItems = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
  ];

  let containerRef: ReturnType<typeof createRef<HTMLDivElement>>;
  let focusedIndex: number;
  let setFocusedIndex: jest.Mock;
  let onSelect: jest.Mock;
  let onEscape: jest.Mock;

  beforeEach(() => {
    // Create a real DOM element
    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);

    // Create a ref with the container
    containerRef = { current: container };

    focusedIndex = 0;
    setFocusedIndex = jest.fn(updater => {
      if (typeof updater === 'function') {
        focusedIndex = updater(focusedIndex);
      } else {
        focusedIndex = updater;
      }
    });
    onSelect = jest.fn();
    onEscape = jest.fn();
  });

  afterEach(() => {
    if (containerRef.current) {
      document.body.removeChild(containerRef.current);
    }
  });

  const dispatchKeyEvent = (key: string) => {
    if (containerRef.current) {
      containerRef.current.focus();
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    }
  };

  it('should navigate forward with ArrowRight', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('ArrowRight');
    expect(setFocusedIndex).toHaveBeenCalled();
  });

  it('should navigate forward with ArrowDown', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('ArrowDown');
    expect(setFocusedIndex).toHaveBeenCalled();
  });

  it('should navigate backward with ArrowLeft', () => {
    focusedIndex = 1;
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('ArrowLeft');
    expect(setFocusedIndex).toHaveBeenCalled();
  });

  it('should navigate backward with ArrowUp', () => {
    focusedIndex = 1;
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('ArrowUp');
    expect(setFocusedIndex).toHaveBeenCalled();
  });

  it('should select item with Enter key', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex: 0,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('Enter');
    expect(onSelect).toHaveBeenCalledWith(mockItems[0], 0);
  });

  it('should select item with Space key', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex: 1,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent(' ');
    expect(onSelect).toHaveBeenCalledWith(mockItems[1], 1);
  });

  it('should call onEscape with Escape key', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    dispatchKeyEvent('Escape');
    expect(onEscape).toHaveBeenCalled();
  });

  it('should not handle events when container is not focused', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    // Don't focus the container - focus a different element
    const otherElement = document.createElement('button');
    document.body.appendChild(otherElement);
    otherElement.focus();

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    document.dispatchEvent(event);

    expect(onSelect).not.toHaveBeenCalled();
    document.body.removeChild(otherElement);
  });

  it('should not select when focusedIndex is out of bounds', () => {
    renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex: -1,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    containerRef.current?.focus();

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    document.dispatchEvent(event);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should cleanup event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useKeyboardNavigation({
        containerRef,
        items: mockItems,
        focusedIndex,
        setFocusedIndex,
        onSelect,
        onEscape,
      })
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
