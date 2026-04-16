SELECT COUNT(*) as count
FROM alpha_raw.token_price_snapshots
WHERE source = 'coingecko' AND token_symbol = :token_symbol
