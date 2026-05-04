See @README.md for project overview and @package.json for available scripts.

# Supabase clients

Two clients exist — use the right one:

- **Anon** (`DatabaseService.getClient()`): default for all user-facing reads/writes (RLS enforced)
- **Service-role** (`DatabaseService.getServiceRoleClient()`): bypasses RLS — only for onboarding, admin flows, and job processing

# Gotchas

- Swagger is removed. Do not reintroduce documentation-only endpoints.
- `ADMIN_API_KEY` is the canonical auth for job routes. `API_KEY` is still accepted as a legacy fallback.
- Tests hit the Hono app directly via `app.request(...)` — no Nest test harness or module metadata.
