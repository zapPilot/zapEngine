export {
  bridgeSettlement,
  isCanonicalBaseArbitrumUsdc,
  normalizeBridgeStatus,
  quoteIdentity,
  signalOptions,
} from './bridge-adapter.shared.js';
export type {
  BridgeTrackingInput,
  FetchLike,
} from './bridge-adapter.shared.js';
export type { BridgeProvider } from './bridge-provider.js';
export { pollBridgeStatus } from './poll-bridge-status.js';
export type {
  BridgeQuote,
  BridgeQuoteRequest,
  BridgeSettlement,
} from './bridge.types.js';
