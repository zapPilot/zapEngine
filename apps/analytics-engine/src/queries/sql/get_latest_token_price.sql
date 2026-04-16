SELECT
    snapshot_date,
    price_usd,
    market_cap_usd,
    volume_24h_usd,
    source,
    token_symbol,
    token_id
FROM alpha_raw.token_price_snapshots
WHERE source = 'coingecko' AND token_symbol = :token_symbol
ORDER BY snapshot_date DESC
LIMIT 1
