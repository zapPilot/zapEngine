SELECT
    snapshot_date,
    dma_200
FROM alpha_raw.token_price_dma_snapshots
WHERE
    snapshot_date >= :start_date
    AND snapshot_date <= :end_date
    AND token_symbol = :token_symbol
    AND dma_200 IS NOT NULL
ORDER BY snapshot_date ASC
