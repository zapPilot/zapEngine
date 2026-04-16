SELECT
    snapshot_date,
    ratio_value,
    dma_200,
    is_above_dma
FROM alpha_raw.token_pair_ratio_dma_snapshots
WHERE
    snapshot_date >= :start_date
    AND snapshot_date <= :end_date
    AND base_token_symbol = :base_token_symbol
    AND quote_token_symbol = :quote_token_symbol
ORDER BY snapshot_date ASC
