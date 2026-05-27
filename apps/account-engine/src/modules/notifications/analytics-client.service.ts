/**
 * Back-compat re-export shim.
 *
 * The implementation has been split into:
 *   - analytics-client/client.ts   — HTTP transport
 *   - analytics-client/mappers.ts  — pure response-mapping functions
 *
 * This file exists solely so that existing importers of
 * `./analytics-client.service` or `../../notifications/analytics-client.service`
 * continue to work without modification (Wave 2.4 split).
 */

export { AnalyticsClientService } from './analytics-client/client';
