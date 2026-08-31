import type { ReactElement } from 'react';

/**
 * Native analytics is intentionally inert: App Store builds ship the
 * podcast-only surface and do not include the PostHog client.
 *
 * Keep this component provider-free. The shared root layout renders it on every
 * platform, so reading account/wallet context here would make native startup
 * depend on WalletProvider even though native analytics never sends identity.
 * The web implementation lives in analyticsIdentity.web.ts.
 */
export function AnalyticsIdentitySync(): ReactElement | null {
  return null;
}
