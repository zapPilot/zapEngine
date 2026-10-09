import { vi } from 'vitest';
import type { DesktopAccount } from '@/integration/accountTypes';
export const OWN_USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
export const OTHER_USER_ID = '9a1d1f5e-6c02-4a5b-9e4c-7d1b2f3a4c5d';
export const ETL_JOB_ID = 'etl-job-1';
export const OWN_ADDRESS = '0xf8a6000000000000000000000000000000000f94';
const SECOND_ADDRESS = '0xb17c000000000000000000000000000000000c71';
function baseAccount(): DesktopAccount {
  return {
    bundleView: null,
    isConnected: false,
    isConnecting: false,
    address: null,
    walletAddresses: [],
    walletEntries: [],
    userId: null,
    etlJobId: null,
    isNewUser: false,
    viewingUserId: null,
    isOwnBundle: true,
    isResolvingViewingUser: false,
    isUserResolutionFailed: false,
    isDemo: true,
    email: null,
    loadingUser: false,
    connectionError: null,
    userResolutionError: null,
    connect: vi.fn(async () => 'connected' as const),
    retryUserResolution: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
  };
}

export const accountFixtures = {
  /** Disconnected visitor with no `?userId=` override — the DEMO preview. */
  demo(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return { ...baseAccount(), ...overrides };
  },
  /** Connected wallet whose own account-engine record resolved. */
  ownBundle(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      walletAddresses: [OWN_ADDRESS, SECOND_ADDRESS],
      walletEntries: [
        { address: OWN_ADDRESS, label: 'Main' },
        { address: SECOND_ADDRESS, label: null },
      ],
      userId: OWN_USER_ID,
      etlJobId: ETL_JOB_ID,
      viewingUserId: OWN_USER_ID,
      isOwnBundle: true,
      isDemo: false,
      email: 'owner@example.com',
      ...overrides,
    };
  },
  /** Read-only `?userId=` view of somebody else's bundle. */
  bundleView(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      viewingUserId: OTHER_USER_ID,
      isOwnBundle: false,
      isDemo: false,
      ...overrides,
    };
  },
  /** Connected and still waiting on account-engine. */
  resolving(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      isResolvingViewingUser: true,
      isDemo: false,
      loadingUser: true,
      ...overrides,
    };
  },
  /** Connected wallet whose account record failed to load. */
  resolutionFailed(overrides: Partial<DesktopAccount> = {}): DesktopAccount {
    return {
      ...baseAccount(),
      isConnected: true,
      address: OWN_ADDRESS,
      isResolvingViewingUser: true,
      isUserResolutionFailed: true,
      isDemo: false,
      loadingUser: false,
      userResolutionError: 'Account lookup failed',
      ...overrides,
    };
  },
};
