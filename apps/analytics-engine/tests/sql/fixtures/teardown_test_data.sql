-- ============================================================================
-- SQL TEST DATA TEARDOWN
-- ============================================================================
-- Cleans up test data created by setup_test_data.sql
-- ============================================================================

BEGIN;

-- Delete portfolio snapshots for test wallets
DELETE FROM portfolio_item_snapshots
WHERE wallet IN (
    '0xa1111111111111111111111111111111111111111',
    '0xa2222222222222222222222222222222222222222',
    '0xb1111111111111111111111111111111111111111',
    '0xb2222222222222222222222222222222222222222',
    '0xc1111111111111111111111111111111111111111',
    '0xshared111111111111111111111111111111111'
);

-- Delete test user wallets
DELETE FROM user_crypto_wallets
WHERE user_id IN (
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000003'
);

RAISE NOTICE 'Test data cleaned up successfully';

COMMIT;
