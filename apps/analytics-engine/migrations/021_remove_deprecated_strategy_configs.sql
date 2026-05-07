DELETE FROM public.strategy_saved_configs
WHERE strategy_id IN (
  'dca_classic',
  'dma_gated_fgi',
  'dma_fgi_adaptive_binary_eth_btc',
  'dma_fgi_eth_btc_minimum',
  'dma_fgi_flat_minimum',
  'dma_fgi_hierarchical_spy_crypto',
  'dma_fgi_hierarchical_full',
  'dma_fgi_hierarchical_full_minus_adaptive_dma',
  'dma_fgi_hierarchical_prod',
  'dma_fgi_hierarchical_minimum_dma_buffer',
  'dma_fgi_hierarchical_minimum_dual_above_hold',
  'dma_fgi_hierarchical_minimum_cross_cooldown',
  'dma_fgi_hierarchical_minimum_below_dma_hold',
  'dma_fgi_hierarchical_minimum_dma_disciplined',
  'dma_fgi_eth_btc_minimum_structural'
);
