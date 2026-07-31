/**
 * The marker vocabulary: colour carries the asset, shape carries the action.
 *
 * Splitting the two channels is what makes the set legible. Colouring buy green
 * and sell red *and* the assets by identity needs five hues on a near-black
 * surface, and the pairs that survive CVD do not survive normal vision — red vs
 * orange comes out at dE 11 (below the 15 floor) and violet vs indigo at 5.8.
 * With action moved onto the glyph, the three asset hues below pass every check
 * on #0a0a0a: worst CVD pair dE 10.1, worst normal-vision pair dE 21.7.
 *
 * The literals are deliberately not `var(--pillar-btc)`: they are validated as
 * a set, so aliasing them to shared marketing tokens would let an unrelated
 * tweak silently degrade the separation with no test to catch it. Re-run the
 * dataviz palette validator against #0a0a0a if any of them changes.
 *
 * The legend renders these same glyphs, so identity never rests on colour
 * alone — which also covers `--event-spy` doubling as the success green.
 */
export type MarkerAsset = 'BTC' | 'ETH' | 'SPY';
export type MarkerAction = 'buy' | 'sell' | 'rotate';

export const MARKER_COLOR: Record<MarkerAsset, string> = {
  BTC: 'var(--event-btc)',
  ETH: 'var(--event-eth)',
  SPY: 'var(--event-spy)',
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
      <path d={MARKER_PATH[action]} />
    </svg>
  );
}
