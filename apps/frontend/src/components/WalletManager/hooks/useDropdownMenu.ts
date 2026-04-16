import { useCallback, useEffect, useState } from "react";

import type { MenuPosition } from "../types/wallet.types";

interface UseDropdownMenuResult {
  openDropdown: string | null;
  menuPosition: MenuPosition | null;
  openDropdownMenu: (walletId: string, buttonElement: HTMLElement) => void;
  closeDropdown: () => void;
  toggleDropdown: (walletId: string, buttonElement: HTMLElement) => void;
}

export function useDropdownMenu(): UseDropdownMenuResult {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  // Handle opening dropdown with position calculation
  const openDropdownMenu = useCallback(
    (walletId: string, buttonElement: HTMLElement) => {
      const rect = buttonElement.getBoundingClientRect();
      const MENU_WIDTH = 192; // w-48
      const estimatedHeight = 210; // rough height for options

      const openUp = rect.bottom + estimatedHeight > window.innerHeight - 8;
      const top = openUp
        ? Math.max(8, rect.top - estimatedHeight - 4)
        : rect.bottom + 4;

      // Align right edge to button right, clamp within viewport
      const preferredLeft = rect.right - MENU_WIDTH;
      const left = Math.max(
        8,
        Math.min(preferredLeft, window.innerWidth - MENU_WIDTH - 8)
      );

      setMenuPosition({ top, left });
      setOpenDropdown(walletId);
    },
    []
  );

  // Handle closing dropdown
  const closeDropdown = useCallback(() => {
    setOpenDropdown(null);
    setMenuPosition(null);
  }, []);

  // Handle toggling dropdown
  const toggleDropdown = useCallback(
    (walletId: string, buttonElement: HTMLElement) => {
      if (openDropdown === walletId) {
        closeDropdown();
      } else {
        openDropdownMenu(walletId, buttonElement);
      }
    },
    [openDropdown, closeDropdown, openDropdownMenu]
  );

  // Click outside handler
  useEffect(() => {
    if (!openDropdown) return;

    const handleClickOutside = () => closeDropdown();
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openDropdown, closeDropdown]);

  return {
    openDropdown,
    menuPosition,
    openDropdownMenu,
    closeDropdown,
    toggleDropdown,
  };
}
