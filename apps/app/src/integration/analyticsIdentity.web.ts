import { type ReactElement, useEffect, useRef } from 'react';

import { useAccount } from '@/integration/useAccount';
import {
  identifyAnalyticsUser,
  resetAnalyticsUser,
  trackEvent,
} from '@/observability/analytics';

/**
 * Joins the anonymous PostHog session to the account-engine user id on web.
 *
 * Watches the resolved `userId` rather than the wallet's `isConnected` flag:
 * a connection is only useful for analytics once the backend user record has
 * settled, and that is also the identifier the marketing site's funnel joins on.
 */
export function AnalyticsIdentitySync(): ReactElement | null {
  const { userId, isNewUser } = useAccount();
  const identifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (userId === identifiedRef.current) return;

    if (userId === null) {
      identifiedRef.current = null;
      resetAnalyticsUser();
      return;
    }

    identifiedRef.current = userId;
    identifyAnalyticsUser(userId);
    trackEvent('wallet_connected', { is_new_user: isNewUser });
  }, [isNewUser, userId]);

  return null;
}
