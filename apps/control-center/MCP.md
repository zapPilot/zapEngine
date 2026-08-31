# Ops MCP

The Control Center exposes the same normalized, read-only operations model to agents over two MCP transports.

| Transport | Entry point | Authentication | Intended use |
| --- | --- | --- | --- |
| stdio | repository `/.mcp.json` -> `scripts/ops-mcp.mjs` | local Infisical access | Claude Code, OpenCode, and other repository-local agents |
| remote HTTP | `POST /api/mcp` | `Authorization: Bearer $OPS_MCP_TOKEN` | remote MCP clients using the deployed Control Center |

## Credential boundaries

`OPS_MCP_TOKEN` only authenticates a remote MCP client to `/api/mcp`. It is not a GitHub, Fly, Sentry, or PostHog credential and is never required by the stdio transport.

Provider credentials stay server-side and are used by the operations adapters:

- `OPS_GITHUB_TOKEN`
- `FLY_OPS_TOKEN`
- `SENTRY_OPS_AUTH_TOKEN` + `SENTRY_ORG_SLUG`
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`

The stdio launcher deliberately runs through `scripts/env/run.mjs --environment prod`, so a repository-local agent sees production operational truth instead of silently falling back to the env runner's default `dev` rail. Missing provider credentials still degrade that provider to `unknown`; they must never be interpreted as healthy.

The remote deployment receives the same provider credentials through the Control Center server environment. Clients receive only normalized read models, never provider tokens.

## Recommended agent flow

1. Call `ops_status` first to get all eight domains, signals, and deterministic priorities.
2. For a priority incident, call `ops_investigate` with the stable signal fingerprint. This is the normal bounded incident packet and may use `force: true` when an operator explicitly needs fresh provider reads.
3. Call `ops_inspect_signal` only when extra provider-specific evidence is needed. It intentionally has no `force` flag because it performs a bounded direct inspection rather than reading the cached aggregate snapshot.
4. Use `ops_domain`, `ops_signal`, `ops_customers`, `ops_social`, or the `ops_costs` compatibility alias for narrower reads.

`ops_costs` is intentionally retained as a compatibility alias for the costs projection of the shared operations snapshot. Do not add dashboard endpoints as MCP tools merely to mirror the HTTP API; MCP remains the operations/incident interface unless a separate agent use case proves the need.

## Force semantics

`force: true` bypasses per-provider caches on aggregate operations reads. It is an operator escape hatch after a fix or during incident triage, not a default: a forced snapshot fans out to providers and is more expensive and latency-sensitive.

The Vercel MCP function therefore has a 30-second maximum duration. Provider calls remain individually bounded by their adapter limits.

## Local verification

From a client that reads the repository `/.mcp.json`:

1. Confirm `zap-pilot-ops` appears in `tools/list`.
2. Call `ops_status` and confirm all eight domains are present.
3. Confirm configured production providers do not all report `unknown` because of missing environment injection.
4. Pick a real signal fingerprint and call `ops_investigate`.

The repository tests also lock `/.mcp.json` to the canonical launcher and assert that the launcher explicitly selects the production environment.

## Remote verification

Send MCP requests to `/api/mcp` with the bearer token from `OPS_MCP_TOKEN`. Missing configuration, missing authorization, and incorrect authorization all return the same `401 Unauthorized` response so the endpoint does not disclose whether a token is configured.

The HTTP integration tests cover protocol initialization, `tools/list`, and `tools/call` for `ops_status`, including `structuredContent`.
