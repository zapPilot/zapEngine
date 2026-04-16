SELECT
    snapshot_date,
    price_usd,
    market_cap_usd,
    volume_24h_usd,
    source,
    token_symbol,
    token_id
FROM alpha_raw.token_price_snapshots
WHERE
    snapshot_date = :date
    AND source = 'coingecko'
    AND token_symbol = :token_symbol
LIMIT 1
