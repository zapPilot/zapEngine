/**
 * Native half of the product-analytics platform split.
 *
 * The iOS build ships podcast-only and the store builds carry no analytics SDK,
 * so every entry point here is inert. Crucially this module must never import
 * `posthog-js` — that import is what would pull a browser SDK into the Hermes
 * bundle guarded by `scripts/assert-ios-bundle-clean.cjs`.
 */

export type AnalyticsProps = Record<string, string | number | boolean>;

export function trackEvent(_name: string, _props?: AnalyticsProps): void {}

export function identifyAnalyticsUser(
  _userId: string,
  _props?: AnalyticsProps,
): void {}

export function resetAnalyticsUser(): void {}
