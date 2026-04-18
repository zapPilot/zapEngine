import { useEffect, RefObject } from 'react';

interface UseKeyboardNavigationOptions<T, E extends HTMLElement = HTMLElement> {
  containerRef: RefObject<E | null>;
  items: T[];
  focusedIndex: number;
  setFocusedIndex: (index: number | ((prev: number) => number)) => void;
  onSelect?: (item: T, index: number) => void;
  onEscape?: () => void;
}

/**
 * Custom hook to handle keyboard navigation for a list of items
 * @param options Configuration options for keyboard navigation
 */
export function useKeyboardNavigation<T, E extends HTMLElement = HTMLElement>({
  containerRef,
  items,
  focusedIndex,
  setFocusedIndex,
  onSelect,
  onEscape,
}: UseKeyboardNavigationOptions<T, E>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle keyboard events when the container has focus
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < items.length && onSelect) {
            onSelect(items[focusedIndex], focusedIndex);
          }
          break;

        case 'Escape':
          event.preventDefault();
          if (onEscape) {
            onEscape();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, items, focusedIndex, setFocusedIndex, onSelect, onEscape]);
}
