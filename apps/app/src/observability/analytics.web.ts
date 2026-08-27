/**
 * Web half of the product-analytics platform split.
 *
 * Initializes on import (like `configureSentry.web.ts`) because `entrypoint.js`
 * loads it before expo-router evaluates the route tree — otherwise the first
 * `$pageview` of a session is lost.
 */
import posthogClient from 'posthog-js';

import { APP_RUNTIME } from '@/config/appRuntime';

import { buildAnalyticsConfig } from './analyticsConfig';

export type AnalyticsProps = Record<string, string | number | boolean>;

// Literal dot-access env reads on purpose: babel-preset-expo inlines only that
// form at bundle time, and scripts/check-dead-env.sh recognizes only that form.
const config = buildAnalyticsConfig(
  process.env.EXPO_PUBLIC_POSTHOG_KEY,
  process.env.EXPO_PUBLIC_POSTHOG_HOST,
);

const enabled = Boolean(config);

if (config) {
  posthogClient.init(config.key, {
    // expo-router navigates client-side, so the default `true` would only ever
    // report the first screen of a session.
    capture_pageview: 'history_change',
    // Replay stays off until a masking policy covers wallet addresses and
    // balances; a project-side toggle must not be able to start recording them.
    disable_session_recording: true,
    respect_dnt: true,
    ...(config.apiHost ? { api_host: config.apiHost } : {}),
  });
  // The marketing site reports into the same project. `runtime` separates the
  // Electron shell from the browser, both of which run this same web bundle.
  posthogClient.register({ surface: 'app', runtime: APP_RUNTIME });
}

export function trackEvent(name: string, props?: AnalyticsProps): void {
  if (!enabled) return;
  posthogClient.capture(name, props);
}

export function identifyAnalyticsUser(
  userId: string,
  props?: AnalyticsProps,
): void {
  if (!enabled) return;
  posthogClient.identify(userId, props);
}

export function resetAnalyticsUser(): void {
  if (!enabled) return;
  posthogClient.reset();
}
