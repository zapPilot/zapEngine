import { createContext, type PropsWithChildren, useContext } from "react";

import type {
  MenuPosition,
  WalletMenuHandlers,
  WalletOperations,
} from "../types/wallet.types";

/**
 * Context for WalletList component to reduce prop drilling
 * Provides operation handlers and UI state for wallet management
 */
interface WalletListContextValue extends WalletMenuHandlers {
  operations: WalletOperations;
  openDropdown: string | null;
  menuPosition: MenuPosition | null;
}

const WalletListContext = createContext<WalletListContextValue | null>(null);

/**
 * Provider component that wraps WalletList with operation handlers
 * Eliminates prop drilling by providing shared wallet operations via context
 *
 * @example
 * <WalletListProvider
 *   operations={operations}
 *   openDropdown={openDropdown}
 *   onCopyAddress={handleCopy}
 *   {...handlers}
 * >
 *   <WalletList {...reducedProps} />
 * </WalletListProvider>
 */
export function WalletListProvider({
  children,
  ...value
}: PropsWithChildren<WalletListContextValue>) {
  return (
    <WalletListContext.Provider value={value}>
      {children}
    </WalletListContext.Provider>
  );
}

/**
 * Hook to access WalletList context
 * Must be used within WalletListProvider
 *
 * @throws Error if used outside WalletListProvider
 * @returns WalletList context value with operations and handlers
 */
export function useWalletList() {
  const context = useContext(WalletListContext);
  if (!context) {
    throw new Error("useWalletList must be used within WalletListProvider");
  }
  return context;
}
