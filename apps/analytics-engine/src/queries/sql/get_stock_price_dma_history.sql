-- Get stock price 200-DMA history for SPY (S&P500 ETF)
-- Used for portfolio rotation decisions (crypto vs S&P500)

SELECT
    snapshot_date,
    price_usd,
    dma_200,
    price_vs_dma_ratio,
    is_above_dma
FROM alpha_raw.stock_price_dma_snapshots
WHERE
    snapshot_date >= :start_date
    AND snapshot_date <= :end_date
    AND symbol = 'SPY'
    AND source = 'yahoo-finance'
    AND dma_200 IS NOT NULL
ORDER BY snapshot_date ASC