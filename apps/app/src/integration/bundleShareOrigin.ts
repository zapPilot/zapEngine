import { resolveShareOrigin } from '@/integration/bundleShareModel';

/**
 * Native half of the share-origin platform split: no page URL exists, so share
 * links always target the production web origin (via the model's fallback).
 */
export function getBundleShareOrigin(): string {
  return resolveShareOrigin(null);
}
