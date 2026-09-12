# Manual triage and bounded backlog execution

A person chooses a model and invokes `/ops-backlog-triage` to produce work or
`/agent-backlog-worker` to consume it. There is no headless runner or new schedule.
Triage writes issues and one audit comment. The worker claims, fixes, verifies,
opens a PR and uses a deterministic merge check. Humans own releases, production
configuration, spending and product decisions.

## Sources of truth

[The MCP contract](../../apps/control-center/MCP.md) defines provider evidence and
backlog writes. GitHub issues and labels are the work state; there is no lease DB.

| Label or marker                     | Meaning                                            |
| ----------------------------------- | -------------------------------------------------- |
| agent-backlog, agent:weak, risk:low | Bounded worker eligibility                         |
| area:\*, effort:xs/s/m              | Scope and estimated effort                         |
| status:working                      | Claimed through the MCP                            |
| blocked                             | Needs stronger judgement or unavailable validation |
| resolution:already-fixed            | Server verified a fix on main before closing       |
| operator                            | Human decision or production action                |
| triage-log                          | Exactly one open, pinned report issue              |
| ops-fingerprint HTML comment        | Server-written open-issue deduplication key        |
| Agent-Backlog-PR: true              | Worker PR contract marker                          |

## Harness setup

Configure each harness's zap-pilot-ops MCP to use `node scripts/ops-mcp.mjs`
from this repository; it obtains the prod configuration through the existing
Infisical runner. The repository's Claude skills link points to `.agents/skills`.
OpenCode commands and Codex prompts can share the same source:

```bash
ln -s "$REPO/.agents/skills/ops-backlog-triage/SKILL.md" "$HOME/.agents/opencode/commands/ops-backlog-triage.md"
ln -s "$REPO/.agents/skills/ops-backlog-triage/SKILL.md" "$HOME/.codex/prompts/ops-backlog-triage.md"
```

Create those directories if missing. Repeat for agent-backlog-worker. Inspect
existing links before replacing them; preserve real files. MCP registration is
separate from command discovery. Verify the selected harness can call ops_status.

## Triage

Run daily or after meaningful operational change. The skill reads Sentry's full
30d unresolved window, recent main workflow failures, backlog capacity and bounded
hygiene evidence. Unknown providers and skipped scans appear in Coverage. At ten
ready items it creates no more; at five it skips hygiene. It creates at most ten
backlog items, three per area, three hygiene, one medium effort and three operator
issues. Server dedupe plus open/closed issue and PR searches prevent repeats.

## Worker and merge policy

Invoke `/agent-backlog-worker [area:<slug>|#<issue>]`. The optional OpenCode
`/backlog-worker` adds a goal budget. Authorize the documented isolated
backlog worktree workflow when requesting a fresh worker run; repository guardrails
otherwise preserve the current checkout. The batch cap is six issues and two
consecutive blocked results end the run. Every claim must be released or owned by
an open PR before stopping.

[scripts/agents/backlog-pr-merge-check.mjs](../../scripts/agents/backlog-pr-merge-check.mjs)
is authoritative. It requires an open non-draft main PR by the designated account,
a backlog/ branch and marker, eligible open closing issues, MERGEABLE/CLEAN state,
and successful quick-gates, code-quality, tests, e2e, security, check-dead-env and
coverage checks with no pending or failed checks. Scope must match issue paths or
workspaces. At most 40 files and 1500 changed lines are allowed. Workflow/actions,
hooks, env, migrations, lint/CI/agent scripts, harness configuration and root
package/lock/Turbo config are protected. Threshold removals require human review.
Use the returned headSha with `--match-head-commit` when merging; deny/error leaves
the PR open for a person. Branch protection is an additional human-owned control.

## Recovery

| Symptom                                          | Action                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| MCP missing or stdio startup fails               | Register the server; restore Infisical login, then retry read-only ops_status |
| Orphan status:working                            | Inspect open PRs and release through MCP in an interactive session            |
| Merge-check denies valid work                    | Review reasons; a human may independently review/merge                        |
| Backlog flood                                    | Stop producer; a human classifies duplicates/wontfix                          |
| already-fixed rejects branch SHA                 | Supply the main squash/merge commit or merged main PR, rerun acceptance       |
| Duplicate fingerprint after concurrent producers | Stop concurrent runs, retain evidence; labels are not distributed locks       |
| Partial Sentry page                              | Follow nextCursor; do not call the visible subset a total                     |

Superseded/abandoned renders and inactive priority accounts never become repair
backlog; see the MCP's producer fence. A merged patch is not production recovery.
Sentry cleanup requires separate explicit delegation and per-issue evidence.
