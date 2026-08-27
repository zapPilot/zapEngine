See @README.md for project overview and @package.json for available scripts.

# Supabase client

`migrations/` is frozen immutable history; new DB migrations go through root `supabase/migrations/` (see CONTRIBUTING.md "Adding a database migration").

There is exactly **one** client — `DatabaseService.getClient()`, holding the
service-role key. `BaseService.supabase` returns it; there is no second client
and no per-call client selection.

No anon path exists, by design. This project has no Supabase Auth (auth is Privy)
and no Realtime client, so nothing ever authenticates as `authenticated` — the
`anon` role was only ever "the role account-engine happened to use" while holding
full CRUD on eight `public` tables, and provided zero authorization value. Both
roles now have no grants on `public` and RLS denies them outright; see
`supabase/migrations/20260827*_lock_down_public_anon_access.sql`.

Authorization therefore lives entirely in the route layer (Privy identity,
`ADMIN_API_KEY` for job routes) — never assume Postgres will refuse a query on
a caller's behalf.

# Gotchas

- Swagger is removed. Do not reintroduce documentation-only endpoints.
- `src/modules/ledger/` is an append-only substrate whose producers are not built yet. It is intentionally absent from `container.ts` — do not register it there just to make it "look used" (its spec already keeps the deadcode gate satisfied). Wire it only when a real signal/decision/plan/execution producer needs it; track that work in GitHub Issues rather than a status Markdown file.
- `ADMIN_API_KEY` is the only supported auth for job routes.
- Tests hit the Hono app directly via `app.request(...)` — no Nest test harness or module metadata.
- `tsconfig.json` intentionally overrides `lib` to add `DOM`/`DOM.Iterable` on top of the `@zapengine/tsconfig/node.json` (ES2022-only) preset — load-bearing for undici `fetch`/`Response.json()` typing in `alpha-etl-http.service.ts` (without it, strict mode flags TS18046). Do not "align with the shared preset"; the real fix is typing the `response.json()` payloads first, then dropping DOM.

# Architecture boundary

account-engine is the **identity / persistence** plane — it plans no money movement.
The deposit-plan endpoint is a dead accidental tenant; do not extend it. The ONLY
intent/orchestration code permitted here is a single bounded `plan-orchestration`
module: its own `POST /plan-orchestration/*`
routes, its own `@zapengine/types` contract, no imports to/from the rest of
account-engine, shaped for extraction to `apps/plan-orchestration`. Nothing else in
account-engine may import `@zapengine/intent-engine`. See [Architecture planes](../../docs/architecture/planes.md).
