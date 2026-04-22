import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useWalletList,
  WalletListProvider,
} from '../../../../../src/components/WalletManager/contexts/WalletListContext';

const mockValue = {
  operations: {
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    subscribing: { isLoading: false, error: null },
  },
  openDropdown: null,
  menuPosition: null,
  onCopyAddress: vi.fn(),
  onEditWallet: vi.fn(),
  onDeleteWallet: vi.fn(),
  onToggleDropdown: vi.fn(),
  onCloseDropdown: vi.fn(),
};

describe('WalletListContext', () => {
  it('provides context values through WalletListProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WalletListProvider {...mockValue}>{children}</WalletListProvider>
    );
    const { result } = renderHook(() => useWalletList(), { wrapper });
    expect(result.current.operations).toBe(mockValue.operations);
    expect(result.current.openDropdown).toBeNull();
    expect(result.current.onCopyAddress).toBe(mockValue.onCopyAddress);
  });

  it('throws when useWalletList is used outside provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useWalletList())).toThrow(
      'useWalletList must be used within WalletListProvider',
    );
    spy.mockRestore();
  });
});
