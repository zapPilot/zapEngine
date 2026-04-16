-- ============================================================================
-- SQL TEST DATA SETUP
-- ============================================================================
-- Creates realistic test data for validating SQL query fixes:
-- 1. get_portfolio_daily_returns.sql (JOIN + division-by-zero protection)
-- 2. get_portfolio_drawdown_unified.sql (JOIN + drawdown calculations)
--
-- Test Scenarios:
-- - User A: 2 wallets, 30 days of data, volatile portfolio
-- - User B: 2 wallets, 10 days of data, stable portfolio
-- - User C: 1 wallet, edge cases (zeros, gaps, negative values)
-- - Shared Wallet: Tests user isolation
-- ============================================================================

BEGIN;

-- Test User IDs (use UUIDs for realism)
DO $$
DECLARE
    user_a_id UUID := 'a0000000-0000-0000-0000-000000000001';
    user_b_id UUID := 'b0000000-0000-0000-0000-000000000002';
    user_c_id UUID := 'c0000000-0000-0000-0000-000000000003';

    wallet_a1 TEXT := '0xa1111111111111111111111111111111111111

11';
    wallet_a2 TEXT := '0xa2222222222222222222222222222222222222222';
    wallet_b1 TEXT := '0xb1111111111111111111111111111111111111111';
    wallet_b2 TEXT := '0xb2222222222222222222222222222222222222222';
    wallet_c1 TEXT := '0xc1111111111111111111111111111111111111111';
    wallet_shared TEXT := '0xshared111111111111111111111111111111111';

    base_date TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP - INTERVAL '30 days';
    i INT;
BEGIN
    -- ========================================================================
    -- USER A: Volatile Portfolio (30 days, 2 wallets)
    -- ========================================================================

    -- Create wallets for User A
    INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
    VALUES
        (gen_random_uuid(), user_a_id, wallet_a1, 'User A Wallet 1', CURRENT_TIMESTAMP),
        (gen_random_uuid(), user_a_id, wallet_a2, 'User A Wallet 2', CURRENT_TIMESTAMP);

    -- 30 days of portfolio snapshots (volatile: growth, peak, drawdown, recovery)
    FOR i IN 0..29 LOOP
        INSERT INTO portfolio_item_snapshots
        (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
        VALUES
            -- Wallet 1: Simulates volatile crypto portfolio
            (
                gen_random_uuid(),
                wallet_a1,
                base_date + (i || ' days')::INTERVAL,
                1000 + (50 * SIN(i * 0.5)) + (i * 10),  -- Oscillating growth
                'ethereum',
                true
            ),
            -- Wallet 2: Stable stablecoin holdings
            (
                gen_random_uuid(),
                wallet_a2,
                base_date + (i || ' days')::INTERVAL,
                500 + (i * 5),  -- Linear growth
                'ethereum',
                true
            );
    END LOOP;

    -- ========================================================================
    -- USER B: Stable Portfolio (10 days, 2 wallets)
    -- ========================================================================

    -- Create wallets for User B
    INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
    VALUES
        (gen_random_uuid(), user_b_id, wallet_b1, 'User B Wallet 1', CURRENT_TIMESTAMP),
        (gen_random_uuid(), user_b_id, wallet_b2, 'User B Wallet 2', CURRENT_TIMESTAMP);

    -- 10 days of steady growth
    FOR i IN 0..9 LOOP
        INSERT INTO portfolio_item_snapshots
        (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
        VALUES
            (
                gen_random_uuid(),
                wallet_b1,
                base_date + (i || ' days')::INTERVAL,
                2000 + (i * 20),
                'polygon',
                true
            ),
            (
                gen_random_uuid(),
                wallet_b2,
                base_date + (i || ' days')::INTERVAL,
                1000 + (i * 10),
                'polygon',
                true
            );
    END LOOP;

    -- ========================================================================
    -- USER C: Edge Cases (gaps, zeros, negative values)
    -- ========================================================================

    -- Create wallet for User C
    INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
    VALUES
        (gen_random_uuid(), user_c_id, wallet_c1, 'User C Wallet 1', CURRENT_TIMESTAMP);

    -- Day 0: Normal value
    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_c1, base_date, 1500, 'ethereum', true);

    -- Day 3: ZERO value (tests division-by-zero protection)
    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_c1, base_date + INTERVAL '3 days', 0, 'ethereum', true);

    -- Day 5: Recovery (tests gap handling, day 1-2-4 missing)
    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_c1, base_date + INTERVAL '5 days', 2000, 'ethereum', true);

    -- Day 7: Negative value (debt > assets)
    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_c1, base_date + INTERVAL '7 days', -500, 'ethereum', true);

    -- Day 10: Very large value (tests overflow)
    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_c1, base_date + INTERVAL '10 days', 1000000000, 'ethereum', true);

    -- ========================================================================
    -- SHARED WALLET: Tests user isolation
    -- ========================================================================

    -- Wallet exists in snapshots but only linked to User A
    -- Should NOT appear in User B or C results
    INSERT INTO user_crypto_wallets (id, user_id, wallet, label, created_at)
    VALUES
        (gen_random_uuid(), user_a_id, wallet_shared, 'Shared Wallet (User A only)', CURRENT_TIMESTAMP);

    INSERT INTO portfolio_item_snapshots
    (id, wallet, snapshot_at, net_usd_value, chain, has_supported_portfolio)
    VALUES
        (gen_random_uuid(), wallet_shared, base_date, 99999, 'ethereum', true),
        (gen_random_uuid(), wallet_shared, base_date + INTERVAL '1 day', 99999, 'ethereum', true);

    RAISE NOTICE 'Test data created successfully';
    RAISE NOTICE '  User A: % (2 wallets, 30 days, volatile)', user_a_id;
    RAISE NOTICE '  User B: % (2 wallets, 10 days, stable)', user_b_id;
    RAISE NOTICE '  User C: % (1 wallet, edge cases)', user_c_id;

END $$;

COMMIT;
