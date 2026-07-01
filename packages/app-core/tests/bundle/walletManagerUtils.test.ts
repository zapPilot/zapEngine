import { describe, expect, it } from 'vitest';

import {
  getWalletDescription,
  getWalletManagerIdentity,
} from '../../src/hooks/bundle/walletManagerUtils';

describe('wallet manager utilities', () => {
  it('describes disconnected, owner, and viewer states', () => {
    expect(getWalletDescription(false, true)).toBe('No wallet connected');
    expect(getWalletDescription(true, true)).toBe('Manage your wallet bundle');
    expect(getWalletDescription(true, false)).toBe('Viewing wallet bundle');
  });

  it('resolves the viewed bundle identity from URL and authenticated ids', () => {
    expect(getWalletManagerIdentity(undefined, undefined)).toEqual({
      realUserId: '',
      viewingUserId: '',
      isOwnerView: false,
    });
    expect(getWalletManagerIdentity(undefined, 'user-1')).toEqual({
      realUserId: 'user-1',
      viewingUserId: 'user-1',
      isOwnerView: true,
    });
    expect(getWalletManagerIdentity('user-2', 'user-1')).toEqual({
      realUserId: 'user-1',
      viewingUserId: 'user-2',
      isOwnerView: false,
    });
  });
});
