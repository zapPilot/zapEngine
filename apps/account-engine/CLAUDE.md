See @README.md for project overview and @package.json for available scripts.

# Supabase clients

Two clients exist — use the right one:

- **Anon** (`DatabaseService.getClient()`): default for all user-facing reads/writes (RLS enforced)
- **Service-role** (`DatabaseService.getServiceRoleClient()`): bypasses RLS — only for onboarding, admin flows, and job processing

# Gotchas

- Swagger is removed. Do not reintroduce documentation-only endpoints.
- `ADMIN_API_KEY` is the canonical auth for job routes. `API_KEY` is still accepted as a legacy fallback.
- Tests hit the Hono app directly via `app.request(...)` — no Nest test harness or module metadata.

# AI Tool Documentation

This directory uses **CLAUDE.md** as the single source of truth for AI assistant context.

| File        | Purpose                                  | Type                  |
| ----------- | ---------------------------------------- | --------------------- |
| `CLAUDE.md` | Canonical documentation for all AI tools | Regular file          |
| `AGENTS.md` | Codex/Github Copilot compatibility       | Symlink → `CLAUDE.md` |
| `GEMINI.md` | Google Gemini compatibility              | Symlink → `CLAUDE.md` |

**Adding new AI tools:** Create a new `{TOOL}.md` as a symlink to `CLAUDE.md` for consistency.
