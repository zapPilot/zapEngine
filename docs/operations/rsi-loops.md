# Operational learning and growth loops

Reliability keeps the canonical OperationsService ranking. Growth uses a separate
lazy `ops_growth` tool and [growth skill](../../.agents/skills/growth/SKILL.md).
Coverage review is [interactive](../../.agents/skills/coverage-review/SKILL.md),
never scheduled. Provider exploration proposes detectors for human review; it
does not change adapters or feed weak-agent backlog work.

## Interactive sessions

From the repository root, run one of:

```bash
node scripts/operations/agent-session.mjs triage
node scripts/operations/agent-session.mjs worker
node scripts/operations/agent-session.mjs growth
node scripts/operations/agent-session.mjs coverage-review
```

The launcher requires a terminal, refuses CI and arbitrary extra flags, ignores
user/project/local settings, and uses `--strict-mcp-config`. The first three
modes register the canonical MCP and the Cloudflare vendor connector; a session
without an OAuth grant simply sees the latter as unauthenticated. Coverage
review loads
`.claude/mcp.coverage-review.json` and `.claude/settings.coverage-review.json`.
These boundaries apply to this launcher, not arbitrary already-open Codex or
Claude sessions. Start a fresh session instead of invoking exploration in triage.

Supabase is scoped to project `urplxsioxepxopuababf` with `read_only=true` and
only database/debugging/docs feature groups. `execute_sql`, migrations and other
mutations are denied. Authenticate the project-scoped server interactively via
Claude's `/mcp` if needed; do not put access tokens in committed configuration.
See the [official options](https://supabase.com/docs/guides/ai-tools/mcp#configuration-options).

Cloudflare is the one vendor MCP registered in every profile, including the
three non-exploration ones, because reading a bill is not exploration. It is
declared with a URL and nothing else: authenticate it interactively through
Claude's `/mcp` (OpenCode: `opencode mcp auth cloudflare`) and grant read
permissions only -- account settings, billing, analytics and R2 storage reads --
and no write permission at all.

The grant is the whole authority boundary, not a tool allowlist. Cloudflare's
server exposes just `search()` and `execute()` over an API of more than 2,500
endpoints; `execute()` runs generated JavaScript against any endpoint the grant
permits, so denying a tool name here would only leave a docs-only connector
while changing nothing about what it can reach. A bearer token is also
supported and is deliberately unused: a token in committed configuration would
hand every clone of this repository whatever it allows. See
[Cloudflare's own MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/).

Fly runs through `scripts/operations/fly-readonly-mcp.mjs`, which exposes only six
reviewed read tools, rejects unknown tools and arguments, and never forwards
provider prompts/resources or server-initiated requests. New upstream tool names
remain denied. Its local flyctl process uses the operator's existing Fly login.
The profile also denies the current upstream write inventory explicitly. Do not
use the raw Fly server in the exploration session. Its upstream annotations mark
even list tools destructive, so the allowlist is reviewed by operation, not by
trusting annotations. See [Fly's server](https://fly.io/docs/mcp/flyctl-server/).

No `.claude/settings.local.json` existed in this checkout at implementation time.
The launcher excludes local settings, so another checkout's permissive allowlist
is not inherited. No unrelated personal settings were edited. Exploration has no
shell/editor/agent tools; it returns issue-ready proposals for operator publication.

The [detector proposal](./coverage-detector-proposal.md) remains a local draft.

## Initial exploration checks — 2026-09-16

The first Supabase exploration read performance/security advisors and aggregate
logs for 06:00–07:00 UTC. Performance advisors reported 11 unindexed foreign keys,
1 auth RLS initplan warning, 2 tables without primary keys, 28 unused-index notices,
12 multiple-permissive-policy findings and 1 Auth connection-allocation notice.
Security advisors reported 3 mutable function search paths and a Postgres version
warning, among other notices. These are findings to assess, not permission to
remove indexes or change policies. No provider state was changed.

A proposed detector is a bounded, deduplicated advisor inventory keyed by rule and
schema/object, with unavailable reads explicitly unknown. Its first candidate is
[mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
which current OperationsService adapters do not collect. A second independent
review must confirm recurrence and assess relevance before promotion; an intentional
configuration or resolved advisory falsifies the proposal. Log counts alone
(19,552 edge, 83 PostgREST, 26 Supavisor, 24 Postgres records) do not establish slow
queries. The attempted severity grouping returned empty values, so error severity
and slow-query coverage remain unobserved. Do not run two immediate reads and call
them two independent reviews.

## Verification

```bash
node --test scripts/operations/*.test.mjs
pnpm turbo run test:coverage type-check lint --filter=@zapengine/control-center
pnpm lint repo
bash scripts/verify-jobs.sh format repo contracts type-check lint
```

Stage 0 validated the gap; Stage 1 provides the callable review; Stage 2 exposes
lazy growth evidence and experiment instructions; Stage 3 implements persistent
version correlation; Stage 4 provides isolated exploration and its first review.
Longitudinal experiment results, second independent reviews, production migration
and deployment are distinct from completed implementation and local verification.

Implementation validation on 2026-09-16: Control Center passed 218 test files /
1,565 tests, coverage gates (97.76% statements, 91.14% branches, 97.67% functions,
97.76% lines), type-check and lint. Four exploration/session tests passed; a live
Fly MCP handshake exposed only six reads and rejected a mutation locally. Both
skills validated. Repository format, drift and aggregate type-check passed after
running the landing page's normal `fumadocs-mdx` postinstall generation.
