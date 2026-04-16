import { type RefObject, useCallback, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/ui/useClickOutside";

export interface TransactionDropdownState {
  dropdownRef: RefObject<HTMLDivElement | null>;
  isAssetDropdownOpen: boolean;
  isChainDropdownOpen: boolean;
  toggleAssetDropdown: () => void;
  toggleChainDropdown: () => void;
  closeDropdowns: () => void;
}

export function useTransactionDropdownState(): TransactionDropdownState {
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdowns = useCallback(() => {
    setIsAssetDropdownOpen(false);
    setIsChainDropdownOpen(false);
  }, []);

  const toggleAssetDropdown = useCallback(() => {
    setIsAssetDropdownOpen(prev => !prev);
    setIsChainDropdownOpen(false);
  }, []);

  const toggleChainDropdown = useCallback(() => {
    setIsChainDropdownOpen(prev => !prev);
    setIsAssetDropdownOpen(false);
  }, []);

  const isAnyDropdownOpen = isAssetDropdownOpen || isChainDropdownOpen;
  useClickOutside(dropdownRef, closeDropdowns, isAnyDropdownOpen, {
    enableEscapeKey: false,
  });

  return {
    dropdownRef,
    isAssetDropdownOpen,
    isChainDropdownOpen,
    toggleAssetDropdown,
    toggleChainDropdown,
    closeDropdowns,
  };
}
