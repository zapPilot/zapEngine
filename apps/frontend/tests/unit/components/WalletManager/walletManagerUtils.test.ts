import { describe, expect, it } from 'vitest';

import {
  getWalletDescription,
  getWalletManagerIdentity,
} from '@/components/WalletManager/walletManagerUtils';

describe('getWalletDescription', () => {
  it('reports a disconnected wallet regardless of ownership', () => {
    expect(getWalletDescription(false, true)).toBe('No wallet connected');
    expect(getWalletDescription(false, false)).toBe('No wallet connected');
  });

  it('distinguishes owner vs viewer copy when connected', () => {
    expect(getWalletDescription(true, true)).toBe('Manage your wallet bundle');
    expect(getWalletDescription(true, false)).toBe('Viewing wallet bundle');
  });
});

describe('getWalletManagerIdentity', () => {
  it('returns empty ids and a non-owner view when nothing is known', () => {
    expect(getWalletManagerIdentity(undefined, undefined)).toEqual({
      realUserId: '',
      viewingUserId: '',
      isOwnerView: false,
    });
  });

  it('marks an owner view when the authenticated user views their own bundle', () => {
    expect(getWalletManagerIdentity('user-1', 'user-1')).toEqual({
      realUserId: 'user-1',
      viewingUserId: 'user-1',
      isOwnerView: true,
    });
  });

  it('falls back to the real user id when no url user id is given', () => {
    expect(getWalletManagerIdentity(undefined, 'user-1')).toEqual({
      realUserId: 'user-1',
      viewingUserId: 'user-1',
      isOwnerView: true,
    });
  });

  it('marks a non-owner view when viewing another user bundle', () => {
    expect(getWalletManagerIdentity('user-2', 'user-1')).toEqual({
      realUserId: 'user-1',
      viewingUserId: 'user-2',
      isOwnerView: false,
    });
  });
});
