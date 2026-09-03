import type { ReactElement } from 'react';

// iOS ships podcast-only and the HLP route is never reached there; the stub
// exists purely so Metro drops the wallet/Hyperliquid imports from the iOS
// bundle.
export function HlpProgressScreen(): ReactElement | null {
  return null;
}
