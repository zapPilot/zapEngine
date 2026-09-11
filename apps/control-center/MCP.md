# Ops MCP

The Control Center exposes the normalized operations model to agents over two MCP transports. Reads remain the default. Mutations are narrowly allowlisted: backlog lifecycle actions are constrained to low-risk `zapPilot/zapEngine` Issues, while Sentry resolution remains a separately verified single-issue action.

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

Agent backlog access deliberately does **not** privilege-raise `OPS_GITHUB_TOKEN`:

- `OPS_GITHUB_BACKLOG_TOKEN` — fine-grained token for `zapPilot/zapEngine` with Issues read/write only. It backs both the normalized backlog read and the bounded issue mutations. If it is absent, reads degrade to `unconfigured` and mutations fail closed.

Sentry remediation uses a separate server-side credential:

- `SENTRY_OPS_WRITE_TOKEN` — create this with Sentry `event:write` scope only. Do not replace the read token with it and do not grant `event:admin`.

Normal Sentry collection and inspection never fall back to the write token. If `SENTRY_OPS_WRITE_TOKEN` is absent, all read tools continue to work and `ops_resolve_sentry_issue` fails closed before sending a request.

The stdio launcher deliberately runs through `scripts/env/run.mjs --environment prod`, so a repository-local agent sees production operational truth instead of silently falling back to the env runner's default `dev` rail. Missing provider read credentials still degrade that provider to `unknown`; they must never be interpreted as healthy.

The remote deployment receives the same provider credentials through the Control Center server environment. Clients receive normalized read models and bounded action results, never provider tokens.

## Recommended agent flow

1. Call `ops_status` first to get all eight domains, signals, deterministic priorities, and the agent backlog summary.
2. For a priority incident, call `ops_investigate` with the stable signal fingerprint. This is the normal bounded incident packet and may use `force: true` when an operator explicitly needs fresh provider reads. Read its `correlation` block to traverse repository-backed service relationships and its `remediation` block before proposing any fix.
3. Call `ops_inspect_signal` only when extra provider-specific evidence is needed. For Sentry it returns the internal numeric issue IDs needed for remediation.
4. Use `ops_domain`, `ops_signal`, `ops_customers`, `ops_social`, or the `ops_costs` compatibility alias for narrower operational reads.
5. For safe background engineering capacity, call `ops_backlog_claim`. It picks the oldest ready issue, optionally restricted by `area:*`, and marks it `status:working`. If the task is unsuitable, use `ops_backlog_release` with `released` or `blocked` plus a reason. There is no lease, TTL, or renew protocol.
6. Strong agents may use `ops_backlog_create` to preserve bounded low-risk follow-up work found during a larger investigation instead of expanding the current PR scope.
7. Use `ops_resolve_sentry_issue` only when the user explicitly asks to close/resolve that issue or explicitly delegates Sentry cleanup after the fix has been verified.

## Agent backlog

GitHub Issues is the only backlog source of truth. The server recognizes open issues carrying `agent-backlog`; newly created MCP backlog issues always receive `agent-backlog`, `agent:weak`, and `risk:low`, plus an optional `area:<slug>`.

Backlog state is deliberately small and label-only:

- no `status:working` and no `blocked` → `ready`
- `status:working` → `working`
- `blocked` → `blocked`
- closed issue → completed; the Reliability card counts completions from the last seven days

`ops_backlog_claim` reads the current GitHub backlog, selects the oldest eligible ready issue, and adds `status:working`. `ops_backlog_release` re-reads the issue first, refuses anything outside `agent-backlog` or not currently working, then either removes `status:working` or adds `blocked` before removing it. Claim/release comments are audit convenience only; the labels are authoritative.

This intentionally does **not** implement distributed locking. Two agents claiming at nearly the same instant can theoretically observe the same ready issue before GitHub applies the first label. That trade-off is accepted for the small number of background agents this repository runs. The worker skill therefore checks for an already-open PR referencing the issue before writing code, and stops without releasing when one exists. If concurrency ever becomes material, add a stronger claim primitive then rather than maintaining a database scheduler pre-emptively.

There is deliberately no `ops_backlog_complete` tool. The implementation PR should use `Fixes #<issue>` and GitHub closes the issue on merge. This prevents an agent from declaring work complete merely because its local attempt ended.

`ops_backlog_create` is not a generic GitHub Issues API. The repository and low-risk labels are server-owned, callers cannot select another repository, and mutations require the dedicated `OPS_GITHUB_BACKLOG_TOKEN`. Backlog membership grants no production, deployment, schema, auth, financial, or incident-remediation authority.

Before using backlog mutations, create the repository labels used by the contract: `agent-backlog`, `agent:weak`, `risk:low`, `blocked`, and `status:working`, plus any desired `area:*` labels.

## Incident correlation

`ops_investigate` adds a `correlation` envelope around the bounded incident packet. The envelope is intentionally deterministic and conservative: it uses the explicit repository topology in `services/operations/topology.ts` plus normalized signals from the same operations snapshot. It does not correlate records because timestamps, titles, or IDs merely look similar.

For mapped services, the envelope contains:

- `basis: repository-topology`;
- canonical service identity (`workspace`, `flyApp`, `sentryProject`, scheduled GitHub workflows, and operational `impact`);
- provider fingerprints for the primary incident plus the related GitHub, Sentry, and Fly inspection targets;
- a bounded `relatedSignals` list from the same impact surface. Social-media incidents include relevant PostHog operational signals so an agent can see analytics degradation or availability alongside queue/runtime evidence.

For signals that are not represented in the explicit service topology, `basis` is `unmapped`, the service/provider links remain null, and no heuristic join is attempted. This is a visibility gap, not proof that no relationship exists.

This service-level correlation is not request-level tracing. Do not infer `episode_id -> job_id -> machine_id -> Sentry issue -> deploy SHA -> PostHog session` from proximity. Those edges must be added only after the producers propagate stable correlation identifiers that can be joined without guessing.

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

`ops_costs` is intentionally retained as a compatibility alias for the costs projection of the shared operations snapshot. Do not add dashboard endpoints as MCP tools merely to mirror the HTTP API; each MCP surface needs a separate agent use case and bounded authority.

## Force semantics

`force: true` bypasses per-provider caches on aggregate operations reads. It is an operator escape hatch after a fix or during incident triage, not a default: a forced snapshot fans out to providers and is more expensive and latency-sensitive.

`ops_investigate` performs the forced provider refresh once, then reads the normalized cached snapshot to build the correlation envelope. It must not fan out to every provider a second time merely to add context.

The agent backlog has its own 30-second GitHub cache. `force: true` on `ops_backlog` bypasses that cache and fetches fresh issue labels.

The Vercel MCP function therefore has a 30-second maximum duration. Provider calls remain individually bounded by their adapter limits.

## Local verification

From Claude Code or OpenCode at the repository root:

1. Confirm `zap-pilot-ops` appears in `tools/list`.
2. Call `ops_status` and confirm all eight domains are present.
3. Confirm configured production providers do not all report `unknown` because of missing environment injection.
4. Call `ops_backlog` and confirm GitHub issue counts and ready/working/blocked state match the Reliability view.
5. Pick an active priority fingerprint and call `ops_investigate`; confirm the packet exposes explicit correlation for mapped services, separates `operationalPriorityScore` from the rest of the `remediation` block, and keeps `directMutationAllowed` `false`.
6. Pick a real Sentry signal fingerprint and call `ops_inspect_signal`; confirm the issue evidence includes a numeric issue ID.
7. With `OPS_GITHUB_BACKLOG_TOKEN` configured, claim a disposable low-risk backlog issue, confirm the `status:working` label landed on it, then release it and confirm the label is removed (or `blocked` is added for a blocked release).
8. With `SENTRY_OPS_WRITE_TOKEN` configured, resolve a disposable/test issue through `ops_resolve_sentry_issue` and confirm only that issue changes to `resolved`.

The repository tests lock both client discovery files to the canonical launcher and assert that the launcher explicitly selects the production environment.

## Remote verification

Send MCP requests to `/api/mcp` with the bearer token from `OPS_MCP_TOKEN`. Missing configuration, missing authorization, and incorrect authorization all return the same `401 Unauthorized` response so the endpoint does not disclose whether a token is configured.

The HTTP integration tests cover protocol initialization, tool discovery, `ops_status`, `ops_backlog`, `ops_investigate` including its correlation/remediation facts, and the bounded Sentry resolve tool, including `structuredContent`.

### Sentry history and pagination

`ops_inspect_signal` accepts an optional `sentry` object containing `start`, `end`,
`cursor`, and `query`. These options are rejected for non-Sentry fingerprints.
Supply both ISO-8601 timestamps with a timezone and `start < end`; otherwise the
window defaults to the last 24 hours. `query` defaults to `is:unresolved`; use an
empty string to include resolved issues when inspecting history.

Each call returns up to 25 issue summaries. Read `evidence.nextCursor` and
`evidence.hasMore`; pass the cursor with the same fingerprint, query, and time
range to read the next page. A page is not an organization-wide issue total.
Use explicit timestamps for a stable window across calls. Project fingerprints
scope the provider request before pagination. `evidence.start` and `evidence.end`
report the query window (the default relative window is anchored approximately
at inspection time). The bounded sample is the latest event of the page's top
issue, which may fall outside the requested historical period.

## Operator lifecycle and runtime evidence

`ops_investigate` includes `runtimeCorrelation` (producer-attested records,
namespaced exact-ID edges, explicit gaps) and `operator` (durable history and
action catalog). Service topology remains context, not a runtime causal edge.
The same normalized snapshot builds the incident and service correlation.
Reads never record a cycle or mutate provider state.

The first executable catalog action is one failed localization render retry.
It requires a current completed visual checkpoint, no active lease, an open
podcast deployment gate, no previous repair and no remediation blockers.
The database rechecks these under locks and commits audit plus queue mutation
atomically. A timeout must be reconciled through history, never blindly retried.
Code/PR, deployment/rollback, destructive and investment actions remain human
controlled regardless of severity.

`ops_resolve_sentry_issue` now requires a registered explicit resolution grant
and fresh persisted production verification. Missing fix/deploy identity, fewer
than 900 seconds of observation, failed/incomplete Sentry reads, an unmatched
runtime, or an incomplete job block closure. A merge alone cannot verify an
incident. Resolution attempts and uncertain provider outcomes are persisted;
an uncertain resolve is not automatically repeated.

See [operator runbook](./OPERATOR.md) for local commands, deployment prerequisites,
policy defaults, audit storage and acceptance evidence.