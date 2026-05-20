See @README.md for project overview and @package.json for available scripts.

# Supabase clients

Two clients exist — use the right one:

- **Anon** (`DatabaseService.getClient()`): default for all user-facing reads/writes (RLS enforced)
- **Service-role** (`DatabaseService.getServiceRoleClient()`): bypasses RLS — only for onboarding, admin flows, and job processing

# Gotchas

- Swagger is removed. Do not reintroduce documentation-only endpoints.
- `ADMIN_API_KEY` is the canonical auth for job routes. `API_KEY` is still accepted as a legacy fallback.
- Tests hit the Hono app directly via `app.request(...)` — no Nest test harness or module metadata.
- `tsconfig.json` intentionally overrides `lib` to add `DOM`/`DOM.Iterable` on top of the `@zapengine/tsconfig/node.json` (ES2022-only) preset — load-bearing for undici `fetch`/`Response.json()` typing in `alpha-etl-http.service.ts` (without it, strict mode flags TS18046). Do not "align with the shared preset"; the real fix is typing the `response.json()` payloads first, then dropping DOM.

# Architecture boundary

account-engine is the **identity / persistence** plane — it plans no money movement.
The deposit-plan endpoint is a dead accidental tenant; do not extend it. The ONLY
intent/orchestration code permitted here is a single bounded `plan-orchestration`
module (added when analytics→intent is wired): its own `POST /plan-orchestration/*`
routes, its own `@zapengine/types` contract, no imports to/from the rest of
account-engine, shaped for extraction to `apps/plan-orchestration`. Nothing else in
account-engine may import `@zapengine/intent-engine`. See root `# Architecture planes`.
