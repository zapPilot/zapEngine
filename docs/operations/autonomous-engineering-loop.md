# Two-role engineering loop

The repository exposes only two user-facing autonomous engineering skills:

- `/triage` — use a strong model to inspect operational/repository evidence,
  decide what is actionable, and create bounded weak-agent work or operator work.
- `/worker` — use a weak/cheap model to consume already-triaged low-risk issues,
  implement them, verify them, open PRs and merge only through the deterministic
  backlog merge gate.

There is no separate incident-remediation loop and no separate CI-fix loop. CI,
Sentry and hygiene findings are inputs to triage; bounded implementation is work
for worker. Specialist CI skills remain internal playbooks that worker may read
when a failure matches them.

Humans continue to own releases, production configuration, spending and product
or architecture decisions.

## Sources of truth

[The MCP contract](../../apps/control-center/MCP.md) defines provider evidence and
backlog writes. GitHub Issues and labels are the work state; there is no lease DB.

| Label or marker | Meaning |
| --- | --- |
| `agent-backlog`, `agent:weak`, `risk:low` | Eligible bounded worker work |
| `area:*`, `effort:xs/s/m` | Scope and estimated effort |
| `status:working` | Claimed through MCP |
| `blocked` | Needs stronger judgement or unavailable validation |
| `resolution:already-fixed` | Server verified a fix on main before closing |
| `operator` | Human/strong-model decision or production action |
| `triage-log` | Exactly one open audit/report issue |
| ops-fingerprint HTML comment | Server-written dedupe key |
| `Agent-Backlog-PR: true` | Worker PR contract marker |

## Harness setup

Configure each harness's `zap-pilot-ops` MCP through `node scripts/ops-mcp.mjs`;
the launcher obtains production configuration through the existing Infisical
runner. Repository skills live under `.agents/skills`.

OpenCode commands are `.opencode/commands/triage.md` and
`.opencode/commands/worker.md`. Claude/Codex may invoke the corresponding skills
directly or expose thin wrappers that point at:

```text
.agents/skills/triage/SKILL.md
.agents/skills/worker/SKILL.md
```

Do not duplicate the role logic into harness-specific commands. MCP registration
is separate from command discovery.

## Triage: strong model

Run after meaningful operational change or when you want a fresh company-health
pass. Triage reads the full 30-day unresolved Sentry window, recent main workflow
failures, backlog capacity and bounded hygiene evidence. It then classifies each
candidate as:

- weak-agent backlog work;
- operator/strong-model decision;
- Sentry cleanup candidate;
- ignored/non-actionable history.

Triage does not edit code or open implementation PRs. Its job is to make a good
small contract for worker. Low-risk CI failures are ordinary backlog candidates;
there is no `/goal-ci-fix` side loop.

The backlog caps remain intentionally small: at ten ready items triage creates no
more; at five it skips hygiene. Dedupe uses live backlog fingerprints plus issue
and PR history.

## Worker: weak model

Invoke `/worker [area:<slug>|#<issue>]`. Worker claims through MCP, checks for an
existing PR, implements only the issue contract, runs local acceptance and opens a
marked PR. It may batch at most six issues sharing an area/gate family; two
consecutive blocked items stop the run.

Worker routes implementation failures to existing internal playbooks as needed:
monorepo CI mapping, lint/format, coverage, duplication, build/import, analytics,
Playwright, desktop and env-drift debugging. Those skills are knowledge modules,
not additional workflows users need to choose between.

Worker must release or preserve every claim behind an owned open PR before it
stops.

## Merge policy

[scripts/agents/backlog-pr-merge-check.mjs](../../scripts/agents/backlog-pr-merge-check.mjs)
is authoritative. Only its exit-0 `decision: allow` result permits worker to
squash-merge using the returned head SHA. Deny/error leaves the PR open.

The check requires eligible closing issues, the worker PR marker, bounded scope,
clean mergeability, all required checks and no protected-path/threshold violations.
Branch protection remains an additional human-owned control.

## Recovery

| Symptom | Action |
| --- | --- |
| MCP missing or stdio startup fails | restore MCP/Infisical, retry read-only `ops_status` |
| orphan `status:working` | inspect open PRs, then release through MCP |
| merge-check denies valid work | leave PR open for human review |
| backlog flood | stop triage creation and classify duplicates/wontfix |
| already-fixed rejects branch SHA | provide a main commit or merged-main PR and rerun acceptance |
| duplicate fingerprint after concurrent producers | stop concurrent triage runs; labels are not transactions |
| partial Sentry page | follow `nextCursor`; never report visible subset as total |

Superseded/abandoned renders and inactive priority accounts do not become weak
repair backlog. A merged patch is not production recovery. Sentry resolution
still requires the MCP's production evidence gates and explicit delegation when
using the operator-delegated rail.
