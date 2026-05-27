/**
 * Back-compat barrel for `./analytics-client`.
 *
 * Re-exports the public surface so existing importers of
 * `../analytics-client.service` that switch to this path keep working without
 * any changes beyond the import path update.
 *
 * The original `analytics-client.service.ts` at the parent level now
 * re-exports from here so callers that still import the old path are
 * unaffected.
 */

export { AnalyticsClientService } from './client';
export {
  normalizeDailySuggestionResponse,
  transformToEmailMetrics,
} from './mappers';
