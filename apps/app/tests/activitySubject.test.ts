import { describe, expect, it } from 'vitest';

import {
  selectActivityAddressInput,
  selectVisitedBundleUserId,
} from '../src/integration/activitySubjectModel';

const VISITED_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

describe('selectVisitedBundleUserId', () => {
  it('returns null when viewing the own bundle', () => {
    expect(
      selectVisitedBundleUserId({
        isOwnBundle: true,
        viewingUserId: VISITED_ID,
      }),
    ).toBeNull();
  });

  it('returns the viewed userId when viewing a visited bundle', () => {
    expect(
      selectVisitedBundleUserId({
        isOwnBundle: false,
        viewingUserId: VISITED_ID,
      }),
    ).toBe(VISITED_ID);
  });
});

describe('selectActivityAddressInput', () => {
  it('uses the first own bundle wallet when viewing the own bundle', () => {
    expect(
      selectActivityAddressInput({
        isOwnBundle: true,
        ownWalletAddresses: ['0xowned1', '0xowned2'],
        ownAddress: '0xconnected',
        visitedWalletAddresses: [],
      }),
    ).toBe('0xowned1');
  });

  it('falls back to the connected address when the own bundle is empty', () => {
    expect(
      selectActivityAddressInput({
        isOwnBundle: true,
        ownWalletAddresses: [],
        ownAddress: '0xconnected',
        visitedWalletAddresses: [],
      }),
    ).toBe('0xconnected');
  });

  it('returns null when own has no wallet and no connected address', () => {
    expect(
      selectActivityAddressInput({
        isOwnBundle: true,
        ownWalletAddresses: [],
        ownAddress: null,
        visitedWalletAddresses: [],
      }),
    ).toBeNull();
  });

  it('uses the first visited wallet when viewing a visited bundle', () => {
    expect(
      selectActivityAddressInput({
        isOwnBundle: false,
        ownWalletAddresses: ['0xowned1'],
        ownAddress: '0xconnected',
        visitedWalletAddresses: ['0xvisited1', '0xvisited2'],
      }),
    ).toBe('0xvisited1');
  });

  it('returns null while the visited wallets are still loading', () => {
    expect(
      selectActivityAddressInput({
        isOwnBundle: false,
        ownWalletAddresses: ['0xowned1'],
        ownAddress: '0xconnected',
        visitedWalletAddresses: [],
      }),
    ).toBeNull();
  });
});
