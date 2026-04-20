See @README.md for project overview and @package.json for available scripts.

# Gotchas

- Test framework is **Vitest**, not Jest. Use `vi.mock()`, not `jest.mock()`.
- Import paths MUST include `.js` extension: `import { foo } from './bar.js'` (ES modules)
- Close DB pool in tests: `afterAll(() => closeDbPool())`
- APY ≠ APR — use `aprUtils.ts` for conversions, never calculate manually
- Rate limits are enforced in `BaseApiFetcher` — do not bypass: DeFiLlama 60 req/min, DeBank 1 req/sec, Hyperliquid 60 req/min
- Materialized views refresh automatically when `ENABLE_MV_REFRESH=true`

# AI Tool Documentation

This directory uses **CLAUDE.md** as the single source of truth for AI assistant context.

| File        | Purpose                                  | Type                  |
| ----------- | ---------------------------------------- | --------------------- |
| `CLAUDE.md` | Canonical documentation for all AI tools | Regular file          |
| `AGENTS.md` | Codex/Github Copilot compatibility       | Symlink → `CLAUDE.md` |
| `GEMINI.md` | Google Gemini compatibility              | Symlink → `CLAUDE.md` |

**Adding new AI tools:** Create a new `{TOOL}.md` as a symlink to `CLAUDE.md` for consistency.
