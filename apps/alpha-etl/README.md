# Alpha-ETL

A modern TypeScript ETL system for collecting and processing DeFi data from multiple sources.

## Overview

Alpha-ETL is a webhook-triggered ETL pipeline that operates three main data collection systems:

**Pool APR Pipeline:**
- Fetches pool APR data from DeFiLlama
- Transforms and validates APR/APY data
- Stores timestamped snapshots in `pool_apr_snapshots` table

**Wallet Balance Pipeline:**
- Tracks VIP user wallet token balances via DeBank API
- Fetches user data from internal database
- Stores token balance snapshots in `wallet_token_snapshots` table

**Hyperliquid Vault Pipeline:**
- Tracks VIP user Hyperliquid vault positions and APR metrics
- Fetches vault details and positions for VIP users
- Stores position snapshots in `portfolio_item_snapshots` table
- Stores APR metrics in `hyperliquid_vault_apr_snapshots` table

## Architecture

```
Pipedream Webhook → Express Router → ETL Pipeline Factory → [Source-Specific Processors] → PostgreSQL
                                           ↓
                    Pool APR Pipeline              Wallet Balance Pipeline           Hyperliquid Vault Pipeline
                    ↓                              ↓                                 ↓
                    DeFiLlamaFetcher              SupabaseFetcher + DeBankFetcher   SupabaseFetcher + HyperliquidFetcher
                    ↓                              ↓                                 ↓
                    PoolDataTransformer           WalletBalanceTransformer          HyperliquidDataTransformer
                    ↓                              ↓                                 ↓
                    PoolWriter                    WalletBalanceWriter               PortfolioItemWriter + HyperliquidVaultAprWriter
                    ↓                              ↓                                 ↓
                    pool_apr_snapshots            wallet_token_snapshots            portfolio_item_snapshots + hyperliquid_vault_apr_snapshots
```

## Data Sources

- **DeFiLlama** (`/v2/pools`) - Pool APR data across chains
- **DeBank** (Pro API) - Wallet token balances for VIP users
- **Hyperliquid** (UI API) - Vault positions and APR metrics for VIP users

## Technology Stack

- **Backend**: Node.js with TypeScript and Express.js
- **Database**: PostgreSQL with connection pooling
- **Validation**: Zod for schema validation
- **Testing**: Vitest with supertest
- **Deployment**: Fly.io with Docker

## Project Structure

```
alpha-etl/
├── src/
│   ├── config/
│   │   ├── database.ts      # Supabase connection
│   │   └── environment.ts   # Environment variables
│   ├── services/
│   │   ├── fetchers/        # API data fetchers (TODO)
│   │   ├── transformers/    # Data transformation logic
│   │   └── database/        # Database operations (TODO)
│   ├── routes/
│   │   ├── webhooks.ts      # Pipedream webhook handler
│   │   └── health.ts        # Health check endpoint
│   ├── utils/
│   │   ├── aprUtils.ts      # APY/APR conversion utilities
│   │   ├── symbolUtils.ts   # Token parsing + normalization helpers
│   │   └── logger.ts        # Winston logging
│   └── app.ts               # Express app setup
├── migrations/
│   └── 001_create_pool_apr_snapshots.sql
├── Dockerfile
├── fly.toml
└── package.json
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Create database schema:**
   ```sql
   -- Run the migration in Supabase SQL Editor
   -- migrations/001_create_pool_apr_snapshots.sql
   ```

   Migration note:
   Historical files in `migrations/` use non-sequential numbering, including duplicate numeric prefixes.
   Treat existing migration filenames as immutable history; new migrations should use the next unused prefix after `012`.

4. **Build and run:**
   ```bash
   npm run build
   npm start
   
   # Or for development:
   npm run dev
   ```

## API Endpoints

### Health Check
```
GET /health
```

### Webhook Handler
```
POST /webhooks/pipedream
Content-Type: application/json

{
  "trigger": "scheduled",
  "sources": ["defillama", "debank", "hyperliquid"],
  "filters": {
    "chains": ["ethereum", "arbitrum"],
    "minTvl": 1000000
  }
}
```

### Job Status
```
GET /webhooks/jobs/:jobId
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres

# Server
PORT=3000
NODE_ENV=development

# APIs
DEFILLAMA_API_URL=https://api.llama.fi
DEBANK_API_URL=https://pro-openapi.debank.com
DEBANK_API_KEY=your-debank-api-key-optional
HYPERLIQUID_API_URL=https://api-ui.hyperliquid.xyz

# Webhook
WEBHOOK_SECRET=your-pipedream-webhook-secret

# Optional tuning
RATE_LIMIT_REQUESTS_PER_MINUTE=60
HYPERLIQUID_RATE_LIMIT_RPM=60
LOG_LEVEL=info
```

**Source Configuration:**
- `"defillama"` - Triggers pool APR data collection from DeFiLlama API
- `"debank"` - Triggers VIP user wallet balance collection from DeBank API
- `"hyperliquid"` - Triggers VIP user Hyperliquid vault position and APR collection

## Database Schema

**Pool APR Data** (`pool_apr_snapshots` table):
- Stores time-series pool APR data from DeFiLlama
- Composite primary key: `(pool_id, source, snapshot_time)`
- Indexes on latest snapshots, protocol/chain, and TVL/APR filters
- JSONB field for raw API responses for debugging
- Migration: `migrations/001_create_pool_apr_snapshots.sql`

**Wallet Balance Data** (`wallet_token_snapshots` table):
- Stores VIP user wallet token balances from DeBank
- Tracks token balances, prices, and metadata per user/wallet/token
- Used for portfolio tracking and analytics
- Migration: `migrations/004_create_wallet_token_snapshots_clean.sql`

**Hyperliquid Data** (`hyperliquid_vault_apr_snapshots` and `portfolio_item_snapshots` tables):
- `hyperliquid_vault_apr_snapshots`: Stores time-series vault APR data from Hyperliquid
  - Composite unique constraint: `(vault_address, snapshot_time)`
  - Indexes on vault address, timestamp, and leader address
  - JSONB fields for pool metadata and raw API responses
  - Migration: `migrations/005_create_hyperliquid_vault_apr_snapshots.sql`
- `portfolio_item_snapshots`: Stores VIP user position snapshots
  - Tracks vault positions, USD value, and detailed asset breakdowns
  - JSONB fields for detailed position data
  - Used for portfolio tracking across multiple protocols (shared with DeBank)
  - Migration: Reuses existing portfolio tracking infrastructure

## Deployment

### Fly.io Deployment

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and deploy:**
   ```bash
   fly auth login
   fly deploy
   ```

3. **Set secrets:**
   ```bash
   fly secrets set DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
   fly secrets set WEBHOOK_SECRET=your-webhook-secret
   fly secrets set DEBANK_API_KEY=your-debank-api-key-optional
   ```

## Dev Tooling

- Pre-commit hooks: configured in `alpha-etl/.pre-commit-config.yaml`.
  - Enable locally: `pipx install pre-commit` (or `pip install pre-commit`), then `pre-commit install` from the repo root.
  - Hooks run ESLint fix/validate, TypeScript typecheck, Vitest suites, and basic file hygiene.
- GitHub Actions: CI workflows under `alpha-etl/.github/workflows/` for tests, Docker build/push (GHCR), and Fly.io deploy.

## Features

### ✅ Core ETL System
- **Pool APR Pipeline**: DeFiLlama API integration with rate limiting and APY→APR conversion
- **Wallet Balance Pipeline**: VIP user wallet tracking via DeBank API
- **Hyperliquid Vault Pipeline**: VIP user vault positions and APR metrics tracking
- **Job Queue System**: Async job management with status tracking and error handling
  - Current queue design note: `docs/adr/0001-in-memory-job-queue.md`
- **Database Operations**: Batch upsert/insert operations with deduplication
- **Data Validation**: Zod schemas for type-safe API responses
- **Health Monitoring**: Comprehensive health checks for all data sources
- **Docker Deployment**: Multi-stage builds optimized for Fly.io

### 🚧 Future Enhancements
- [ ] Add comprehensive unit and integration tests
- [ ] Add monitoring and alerting (Discord/email notifications)
- [ ] Implement caching layer for frequently accessed data
- [ ] Create admin dashboard for monitoring ETL jobs

## Getting Started

The triple ETL system is fully functional! Here's how to get started:

1. **Setup Environment**: Copy `.env.example` to `.env` and configure your database credentials
2. **Create Database**: Run migrations in `migrations/` directory in your PostgreSQL database
3. **Install Dependencies**: `npm install`
4. **Test Locally**: `npm run dev`
5. **Deploy to Fly.io**: `fly deploy` (after setting secrets)
6. **Test Pipelines**: Send POST requests to `/webhooks/pipedream` with appropriate source parameters

The system will automatically:
- **Pool APR Pipeline**: Fetch DeFiLlama data, convert APY→APR, store timestamped snapshots
- **Wallet Balance Pipeline**: Query VIP users, fetch wallet balances from DeBank, store token snapshots
- **Hyperliquid Vault Pipeline**: Query VIP users, fetch vault positions and APR, store deduplicated snapshots
- Handle errors gracefully with retries and detailed logging
- Provide real-time job status tracking

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update this README with any changes
4. Use conventional commit messages
