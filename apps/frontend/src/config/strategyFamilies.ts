/**
 * Strategy family metadata — single source of truth for strategy IDs,
 * component IDs, and benchmark config references.
 *
 * When adding a new strategy family, update only this file.
 */

/**
 * Known strategy IDs with their display labels.
 */
export const STRATEGY_IDS: Record<string, string> = {
  dma_gated_fgi: "DMA-Gated FGI",
  simple_dca: "Simple DCA",
};
