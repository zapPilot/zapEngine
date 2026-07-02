import { describe, expect, it } from 'vitest';

import {
  getWalletDescription,
  getWalletManagerIdentity,
} from '../../../src/hooks/bundle/walletManagerUtils';

describe('wallet manager utils', () => {
  it('uses the authenticated user as both viewer and owner when no url user is provided', () => {
    expect(getWalletManagerIdentity(undefined, 'user-123')).toEqual({
      realUserId: 'user-123',
      viewingUserId: 'user-123',
      isOwnerView: true,
    });
  });

  it('keeps direct owner URL views editable for the authenticated owner', () => {
    expect(getWalletManagerIdentity('owner-user', 'owner-user')).toEqual({
      realUserId: 'owner-user',
      viewingUserId: 'owner-user',
      isOwnerView: true,
    });
  });

  it('treats a different url user as a read-only bundle view', () => {
    expect(getWalletManagerIdentity('shared-user', 'owner-user')).toEqual({
      realUserId: 'owner-user',
      viewingUserId: 'shared-user',
      isOwnerView: false,
    });
  });

  it('keeps anonymous views non-owner even when a url user exists', () => {
    expect(getWalletManagerIdentity('shared-user', undefined)).toEqual({
      realUserId: '',
      viewingUserId: 'shared-user',
      isOwnerView: false,
    });
  });

  it('describes disconnected, owner, and read-only bundle states', () => {
    expect(getWalletDescription(false, true)).toBe('No wallet connected');
    expect(getWalletDescription(true, true)).toBe('Manage your wallet bundle');
    expect(getWalletDescription(true, false)).toBe('Viewing wallet bundle');
  });
});
