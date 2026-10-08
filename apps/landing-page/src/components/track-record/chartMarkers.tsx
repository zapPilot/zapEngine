/** Asset color identifies the sleeve; action shape, sheet halo and rule outline remain readable in either mode. */
export type MarkerAsset = 'BTC' | 'ETH' | 'SPY';
export type MarkerAction = 'buy' | 'sell' | 'rotate';

export const MARKER_COLOR: Record<MarkerAsset, string> = {
  BTC: 'var(--sleeve-btc)',
  ETH: 'var(--sleeve-eth)',
  SPY: 'var(--sleeve-spy)',
};

const MARKER_PATH: Record<MarkerAction, string> = {
  buy: 'M6 1 11 11 1 11Z',
  sell: 'M6 11 1 1 11 1Z',
  rotate: 'M6 1 11 6 6 11 1 6Z',
};

export const MARKER_ACTION_LABEL: Record<MarkerAction, string> = {
  buy: 'Buy',
  sell: 'Sell',
  rotate: 'Rotate',
};

export function MarkerGlyph({ action }: { action: MarkerAction }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <path
        d={MARKER_PATH[action]}
        fill="none"
        stroke="var(--sheet)"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d={MARKER_PATH[action]}
        stroke="var(--rule-2)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
