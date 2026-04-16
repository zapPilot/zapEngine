# Code Style

- Use ES modules (`import`/`export`) with `.js` extensions in imports, NOT CommonJS
- Destructure imports when possible: `import { foo } from 'bar.js'`
- Use `const` over `let`, never use `var`
- NO `any` types - use proper TypeScript types or `unknown`
- Prefer `function` declarations for top-level reusable functions
- Use arrow functions for inline callbacks where it improves readability
- NO `console.log` - use `logger` from `utils/logger.js`
- Use strict equality (`===`) always
- NO parameter reassignment
- Return explicit values from functions (no implicit undefined)

# Testing

- Test framework: **Vitest** (NOT Jest)
- Run single test: `npm test -- path/to/file.test.ts`
- Run with watch: `npm run test:watch`
- Coverage thresholds: 95% (statements/branches/functions/lines)
- Tests live in `tests/` directory, NOT alongside source files
- Exception: `src/services/fetchers/__tests__/` for fetcher-specific tests
- Setup file: `tests/setup/global-setup.ts` (auto-loaded)
- Use `vitest` imports: `import { describe, it, expect, vi } from 'vitest'`

# Build & Development

- Build: `npm run build` (TypeScript → `dist/`)
- Dev mode: `npm run dev` (uses `tsx watch`)
- Typecheck: `npm run typecheck` (ALWAYS run before committing)
- Lint: `npm run lint` (ESLint with auto-fix: `npm run lint:fix`)
- Full verification: `npm run verify:full` (typecheck + lint + tests + coverage + deadcode + duplicates)

# Database

- PostgreSQL via Supabase connection pooling
- Migrations in `migrations/` directory (numbered SQL files)
- NEVER modify migrations after they're deployed
- Use parameterized queries to prevent SQL injection
- Connection management: import from `config/database.js`
- Close pool on shutdown: `closeDbPool()`

# Architecture Patterns

- **ETL Processors**: Implement `BaseETLProcessor` interface
- **Fetchers**: Extend `BaseApiFetcher` for rate-limited API calls
- **Transformers**: Extend `BaseTransformer` for data transformation
- **Writers**: Extend `BaseWriter` for database operations
- **Module structure**: Each module has `fetcher.ts`, `transformer.ts`, `processor.ts`, `writer.ts`, `index.ts`
- Use `executeETLFlow()` helper for consistent ETL pipeline execution
- Validate with Zod schemas before processing

# Error Handling

- Use custom error classes from `utils/errors.js` (`APIError`, `ValidationError`, etc.)
- NEVER throw string literals - throw Error objects
- Use `toErrorMessage()` helper to safely extract error messages
- Log errors with context: `logger.error('message', { context })`
- Prefer `Promise.reject(new Error())` over throwing in async functions

# Environment Variables

- Load from `.env` file (use `.env.example` as template)
- Access via `env` object from `config/environment.js`
- NEVER hardcode secrets or API keys
- Required vars: `DATABASE_URL`, `WEBHOOK_SECRET`
- Optional vars have defaults in `environment.ts`

# API Rate Limiting

- DeFiLlama: 60 req/min (enforced by `BaseApiFetcher`)
- DeBank: 1 req/sec (1000ms delay)
- Hyperliquid: 60 req/min (configurable via `HYPERLIQUID_RATE_LIMIT_RPM`)
- Rate limiting is automatic in fetchers - don't bypass it

# Logging

- Use Winston logger from `utils/logger.js`
- Levels: `error`, `warn`, `info`, `debug`
- Include context objects: `logger.info('message', { key: value })`
- Set level via `LOG_LEVEL` env var (default: `info`)
- NEVER log sensitive data (API keys, passwords, PII)

# Workflow

- Create feature branch from `main`
- Run `npm run verify:full` before pushing
- Husky pre-commit hooks will run automatically
- Check deadcode: `npm run deadcode:check`
- Check duplicates: `npm run dup:check`
- Fix deadcode: `npm run deadcode:fix` (use with caution)

# Common Gotchas

- Import paths MUST include `.js` extension (ES modules requirement)
- Vitest uses `vi.mock()` not `jest.mock()`
- Database pool must be closed in tests: `afterAll(() => closeDbPool())`
- Webhook routes require `WEBHOOK_SECRET` header for authentication
- ETL jobs are async - use job queue system, don't block HTTP responses
- APY ≠ APR - use `aprUtils.ts` for conversions
- Materialized views refresh automatically if `ENABLE_MV_REFRESH=true`

# Scripts

- Test fixture data: `npm run test:fixture`
- Validate VIP users: `npm run validate:vip-users`
- Diagnose DeBank: `npm run diagnose:debank`

# Deployment

- Platform: Fly.io with Docker
- Deploy: `fly deploy`
- Set secrets: `fly secrets set KEY=value`
- Health check endpoint: `GET /health`
- Logs: `fly logs`
