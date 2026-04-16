DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users') THEN
        ALTER TABLE public.users
            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT TRUE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_crypto_wallets') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='user_crypto_wallets' AND column_name='updated_at'
        ) THEN
            ALTER TABLE public.user_crypto_wallets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
    END IF;
END$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='portfolio_item_snapshots') THEN
        -- Columns required by integration fixtures
        ALTER TABLE public.portfolio_item_snapshots
            ADD COLUMN IF NOT EXISTS user_id uuid,
            ADD COLUMN IF NOT EXISTS pool_symbols text[],
            ADD COLUMN IF NOT EXISTS protocol_type text,
            ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS id_raw text,
            ADD COLUMN IF NOT EXISTS site_url text,
            ADD COLUMN IF NOT EXISTS asset_dict jsonb,
            ADD COLUMN IF NOT EXISTS asset_token_list jsonb,
            ADD COLUMN IF NOT EXISTS detail jsonb,
            ADD COLUMN IF NOT EXISTS detail_types text[],
            ADD COLUMN IF NOT EXISTS pool text,
            ADD COLUMN IF NOT EXISTS proxy_detail jsonb,
            ADD COLUMN IF NOT EXISTS asset_usd_value numeric,
            ADD COLUMN IF NOT EXISTS debt_usd_value numeric,
            ADD COLUMN IF NOT EXISTS net_usd_value numeric,
            ADD COLUMN IF NOT EXISTS update_at timestamptz,
            ADD COLUMN IF NOT EXISTS name_item text,
            ADD COLUMN IF NOT EXISTS name text,
            ADD COLUMN IF NOT EXISTS chain text,
            ADD COLUMN IF NOT EXISTS has_supported_portfolio boolean,
            ADD COLUMN IF NOT EXISTS snapshot_at timestamptz,
            ADD COLUMN IF NOT EXISTS wallet text,
            ADD COLUMN IF NOT EXISTS logo_url text;

        -- Relax constraints so lightweight test fixtures can insert rows without full production payloads
        ALTER TABLE public.portfolio_item_snapshots
            ALTER COLUMN user_id DROP NOT NULL,
            ALTER COLUMN id_raw DROP NOT NULL,
            ALTER COLUMN name DROP NOT NULL,
            ALTER COLUMN site_url DROP NOT NULL,
            ALTER COLUMN asset_dict DROP NOT NULL,
            ALTER COLUMN asset_token_list DROP NOT NULL,
            ALTER COLUMN detail DROP NOT NULL,
            ALTER COLUMN detail_types DROP NOT NULL,
            ALTER COLUMN pool DROP NOT NULL,
            ALTER COLUMN proxy_detail DROP NOT NULL,
            ALTER COLUMN asset_usd_value DROP NOT NULL,
            ALTER COLUMN debt_usd_value DROP NOT NULL,
            ALTER COLUMN net_usd_value DROP NOT NULL,
            ALTER COLUMN update_at DROP NOT NULL,
            ALTER COLUMN name_item DROP NOT NULL,
            ALTER COLUMN chain DROP NOT NULL,
            ALTER COLUMN has_supported_portfolio DROP NOT NULL,
            ALTER COLUMN snapshot_at DROP NOT NULL;

        ALTER TABLE public.portfolio_item_snapshots
            ALTER COLUMN protocol_type DROP NOT NULL,
            ALTER COLUMN created_at DROP NOT NULL,
            ALTER COLUMN updated_at DROP NOT NULL,
            ALTER COLUMN id_raw SET DEFAULT gen_random_uuid()::text,
            ALTER COLUMN name SET DEFAULT 'unknown',
            ALTER COLUMN site_url SET DEFAULT 'https://example.invalid',
            ALTER COLUMN asset_dict SET DEFAULT '{}'::jsonb,
            ALTER COLUMN asset_token_list SET DEFAULT '[]'::jsonb,
            ALTER COLUMN detail SET DEFAULT '{}'::jsonb,
            ALTER COLUMN detail_types SET DEFAULT ARRAY[]::text[],
            ALTER COLUMN pool SET DEFAULT '',
            ALTER COLUMN proxy_detail SET DEFAULT '{}'::jsonb,
            ALTER COLUMN asset_usd_value SET DEFAULT 0,
            ALTER COLUMN debt_usd_value SET DEFAULT 0,
            ALTER COLUMN net_usd_value SET DEFAULT 0,
            ALTER COLUMN update_at SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN name_item SET DEFAULT 'unknown',
            ALTER COLUMN protocol_type SET DEFAULT 'unknown',
            ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN snapshot_at SET DEFAULT CURRENT_TIMESTAMP,
            ALTER COLUMN has_supported_portfolio SET DEFAULT TRUE;
    END IF;

    -- Relax alpha_raw.hyperliquid_vault_apr_snapshots for fixture inserts
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema='alpha_raw' AND table_name='hyperliquid_vault_apr_snapshots'
    ) THEN
        ALTER TABLE alpha_raw.hyperliquid_vault_apr_snapshots
            ALTER COLUMN leader_address DROP NOT NULL,
            ALTER COLUMN leader_address SET DEFAULT '',
            ALTER COLUMN vault_name DROP NOT NULL,
            ALTER COLUMN vault_name SET DEFAULT '',
            ALTER COLUMN apr DROP NOT NULL,
            ALTER COLUMN apr SET DEFAULT 0,
            ALTER COLUMN snapshot_time DROP NOT NULL,
            ALTER COLUMN snapshot_time SET DEFAULT NOW();
    END IF;
END$$;
