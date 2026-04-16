/**
 * useClickOutside Hook
 *
 * A reusable hook for detecting clicks outside a referenced element
 * and optionally handling the Escape key to close dropdowns/menus.
 *
 * This eliminates code duplication across dropdown components like
 * WalletMenu, WalletFilterSelector, etc.
 *
 * @example
 * ```tsx
 * const menuRef = useRef<HTMLDivElement>(null);
 * const [isOpen, setIsOpen] = useState(false);
 *
 * useClickOutside(menuRef, () => setIsOpen(false), isOpen);
 * ```
 */

import { RefObject, useEffect } from "react";

export interface UseClickOutsideOptions {
  /** Whether to also listen for Escape key press */
  enableEscapeKey?: boolean;
}

/**
 * Hook to detect clicks outside a referenced element
 *
 * @param ref - React ref to the element to monitor
 * @param onClickOutside - Callback when click outside is detected
 * @param isActive - Whether the listener should be active (e.g., menu is open)
 * @param options - Additional configuration options
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClickOutside: () => void,
  isActive = true,
  options: UseClickOutsideOptions = {}
): void {
  const { enableEscapeKey = true } = options;

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClickOutside();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    if (enableEscapeKey) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (enableEscapeKey) {
        document.removeEventListener("keydown", handleEscape);
      }
    };
  }, [ref, onClickOutside, isActive, enableEscapeKey]);
}
