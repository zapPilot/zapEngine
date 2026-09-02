# Ops MCP

The Control Center exposes the normalized operations model to agents over two MCP transports. Reads remain the default; the only write capability is a narrowly allowlisted single-issue Sentry resolve operation.

| Transport   | Entry point                                                                        | Authentication                         | Intended use                                         |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| stdio       | `/.mcp.json` (Claude Code) or `/opencode.json` (OpenCode) -> `scripts/ops-mcp.mjs` | local Infisical access                 | repository-local agents                              |
| remote HTTP | `POST /api/mcp`                                                                    | `Authorization: Bearer $OPS_MCP_TOKEN` | remote MCP clients using the deployed Control Center |

## Credential boundaries

`OPS_MCP_TOKEN` only authenticates a remote MCP client to `/api/mcp`. It is not a GitHub, Fly, Sentry, or PostHog credential and is never required by the stdio transport.

Read-only provider credentials stay server-side and are used by the operations adapters:

- `OPS_GITHUB_TOKEN`
- `FLY_OPS_TOKEN`
- `SENTRY_OPS_AUTH_TOKEN` + `SENTRY_ORG_SLUG`
- `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`

Sentry remediation uses a separate server-side credential:

- `SENTRY_OPS_WRITE_TOKEN` — create this with Sentry `event:write` scope only. Do not replace the read token with it and do not grant `event:admin`.

Normal Sentry collection and inspection never fall back to the write token. If `SENTRY_OPS_WRITE_TOKEN` is absent, all read tools continue to work and `ops_resolve_sentry_issue` fails closed before sending a request.

The stdio launcher deliberately runs through `scripts/env/run.mjs --environment prod`, so a repository-local agent sees production operational truth instead of silently falling back to the env runner's default `dev` rail. Missing provider read credentials still degrade that provider to `unknown`; they must never be interpreted as healthy.

The remote deployment receives the same provider credentials through the Control Center server environment. Clients receive normalized read models and remediation results, never provider tokens.

## Recommended agent flow

1. Call `ops_status` first to get all eight domains, signals, and deterministic priorities.
2. For a priority incident, call `ops_investigate` with the stable signal fingerprint. This is the normal bounded incident packet and may use `force: true` when an operator explicitly needs fresh provider reads. Read its `remediation` block before proposing any fix.
3. Call `ops_inspect_signal` only when extra provider-specific evidence is needed. For Sentry it returns the internal numeric issue IDs needed for remediation.
4. Use `ops_domain`, `ops_signal`, `ops_customers`, `ops_social`, or the `ops_costs` compatibility alias for narrower reads.
5. Use `ops_resolve_sentry_issue` only when the user explicitly asks to close/resolve that issue or explicitly delegates Sentry cleanup after the fix has been verified.

## Remediation facts

`ops_investigate` carries a deterministic, read-only `remediation` block. Operational priority answers how much an incident matters; these facts answer whether it is safe to act on yet. They are intentionally separate: a priority score of 100 can sit next to a hard blocker, because the priority engine weights customers and infrastructure highest precisely where a wrong change costs the most.

The block reports:

- `policyVersion` — the policy revision that produced the facts;
- `operationalPriorityScore` — impact/urgency from the existing priority engine, carried for comparison and never used as an authorization input;
- `observer` — whether the reading itself can be trusted: `ok`, `unknown`, `source-failure`, or `not-active`;
- `inspectionCoverage` — how much deep provider evidence backs the incident: `inspected`, `no-inspector`, `unavailable`, or `not-found`;
- `exposure` — `affectedUsers` and `aumAtRiskUsd` where the signal proves them;
- `terminalState` — whether retries are exhausted, which makes the failure deterministic;
- `directMutationAllowed` — always `false`;
- `blockers` — a non-empty list means the server can prove the incident is not safe to act on yet;
- `reasons` — context that does not block, including the coverage caveat below.

The server deliberately grades no autonomy level. Whether a repair is safe depends on the kind of change it needs, and one signal can require either a one-line guard or a schema migration. Change kind is only knowable after an agent has diagnosed the root cause, so `.agents/skills/ops-incident-remediation` owns that judgement while this block owns the facts a skill cannot see for itself.

Fail-closed rules:

- `unknown` operational state is never remediation-ready;
- an adapter/source failure means the observer failed, which is not proof that the observed system is broken;
- a fingerprint missing from the current snapshot is not an actionable incident;
- an unavailable or not-found deep inspection is missing evidence, not clean evidence;
- every unresolved evidence gap becomes a blocker;
- any signal carrying non-zero `aumAtRiskUsd` stays on a human-controlled rail even when its operational priority is high.

`exposure` reports only what the investigated signal itself proves. Customer impact correlated through service topology is reported separately in the packet's `customerImpact`, and an agent weighing a repair must read both: a job failure can carry no exposure of its own while the same packet shows stale priority portfolios behind it.

`no-inspector` is a caveat rather than a blocker. Only `github-actions`, `sentry`, and `fly` have deep inspectors, so for every other source an empty gap list means nothing was gathered rather than that nothing is wrong. Such an incident may still be repaired from repository evidence, but it must never be described as production-verified.

`ops_resolve_sentry_issue` remains a separate, explicit delegated mutation. Empty `blockers` does not bypass the Sentry resolve gate documented below or the production verification rules in the incident-remediation skill.

`ops_resolve_sentry_issue` takes one numeric Sentry issue ID plus a required human-readable `reason`. The implementation always sends exactly `{ "status": "resolved" }` to that one issue. The caller cannot choose `ignored`, merge issues, assign ownership, make an issue public, delete it, or bulk-mutate issues through MCP.

`ops_costs` is intentionally retained as a compatibility alias for the costs projection of the shared operations snapshot. Do not add dashboard endpoints as MCP tools merely to mirror the HTTP API; MCP remains the operations/incident interface unless a separate agent use case proves the need.

## Force semantics

`force: true` bypasses per-provider caches on aggregate operations reads. It is an operator escape hatch after a fix or during incident triage, not a default: a forced snapshot fans out to providers and is more expensive and latency-sensitive.

The Vercel MCP function therefore has a 30-second maximum duration. Provider calls remain individually bounded by their adapter limits.

## Local verification

From Claude Code or OpenCode at the repository root:

1. Confirm `zap-pilot-ops` appears in `tools/list`.
2. Call `ops_status` and confirm all eight domains are present.
3. Confirm configured production providers do not all report `unknown` because of missing environment injection.
4. Pick an active priority fingerprint and call `ops_investigate`; confirm the packet separates `operationalPriorityScore` from the rest of the `remediation` block and that `directMutationAllowed` is `false`.
5. Pick a real Sentry signal fingerprint and call `ops_inspect_signal`; confirm the issue evidence includes a numeric issue ID.
6. With `SENTRY_OPS_WRITE_TOKEN` configured, resolve a disposable/test issue through `ops_resolve_sentry_issue` and confirm only that issue changes to `resolved`.

The repository tests lock both client discovery files to the canonical launcher and assert that the launcher explicitly selects the production environment.

## Remote verification

Send MCP requests to `/api/mcp` with the bearer token from `OPS_MCP_TOKEN`. Missing configuration, missing authorization, and incorrect authorization all return the same `401 Unauthorized` response so the endpoint does not disclose whether a token is configured.

The HTTP integration tests cover protocol initialization, tool discovery, `ops_status`, `ops_investigate` including its remediation facts, and the bounded Sentry resolve tool, including `structuredContent`.
