-- Fetches all distinct wallet addresses associated with a given user_id
SELECT DISTINCT
    LOWER(wallet) AS wallet_address
FROM
    user_crypto_wallets
WHERE
    user_id::text = CAST(:user_id AS text);
