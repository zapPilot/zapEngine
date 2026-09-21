/**
 * Outcome of an account connect attempt. Dismissing Privy's login UI is a
 * normal user action, not a failure.
 */
export type ConnectOutcome = 'connected' | 'cancelled';

export interface DesktopAccount {
  /** A signing wallet is connected. On iOS watch-only mode this remains false. */
  isConnected: boolean;
  isConnecting: boolean;
  /** Active subject address, or null when there is no portfolio subject. */
  address: string | null;
  /** Bundle wallet addresses used for read-only portfolio/activity data. */
  walletAddresses: string[];
  /** Bundle wallets with user-defined labels for portfolio-level attribution. */
  walletEntries: { address: string; label: string | null }[];
  /** Resolved Zap Pilot user id (from account-engine), or null. */
  userId: string | null;
  /** First-login ETL job returned by account-engine, if one was scheduled. */
  etlJobId: string | null;
  /** Whether account-engine created this user during the current connection. */
  isNewUser: boolean;
  /** User id whose bundle the screens display. */
  viewingUserId: string | null;
  /** False when viewing someone else's/watch-only bundle. */
  isOwnBundle: boolean;
  /** A subject exists and account-engine is still resolving it. */
  isResolvingViewingUser: boolean;
  /** The current subject failed to resolve to an account-engine user. */
  isUserResolutionFailed: boolean;
  /** No live subject to display — screens render DEMO data. */
  isDemo: boolean;
  email: string | null;
  /** Still resolving the backend user record after connect/address change. */
  loadingUser: boolean;
  /** Error raised while connecting the wallet/login itself. */
  connectionError: string | null;
  /** Error raised while loading the subject account record. */
  userResolutionError: string | null;
  connect: () => Promise<ConnectOutcome>;
  retryUserResolution: () => Promise<unknown>;
  disconnect: () => Promise<void>;
}
