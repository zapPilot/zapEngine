# Triage reference

## Where the contract lives

| Question                                               | Read                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| what `remediation` proves and what it does not         | `apps/control-center/MCP.md`, "Remediation facts"                     |
| which resolve rail authorizes a close                  | `apps/control-center/MCP.md`, "Two resolution rails"                  |
| why a stale render or inactive account is not a signal | `apps/control-center/MCP.md`, "What never becomes a signal"           |
| Sentry window, cursor and truncation semantics         | `apps/control-center/MCP.md`, "Sentry history and pagination"         |
| how a fix becomes verified for the server              | `apps/control-center/OPERATOR.md`, "Fix registration and observation" |

`scripts/ops-mcp.mjs` pins the stdio launcher to `--environment prod`, so a
repository-local agent reads production truth. A provider missing its read
credential degrades to `unknown`; that is never healthy.

## Classifying an unresolved Sentry issue

| State                  | Meaning                                                        | Action                                      |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `unfixed`              | Root cause is not fixed                                        | Backlog or operator candidate               |
| `fixed_pending_deploy` | Fix is merged but the affected runtime is still old            | Keep open                                   |
| `deployed_observing`   | Fixed version is live but the observation window is incomplete | Keep open                                   |
| `resolvable`           | Fix is deployed and the resolve gate below passes              | Report; resolve only on explicit delegation |
| `defer`                | Root cause, behavior or safe fix is ambiguous                  | Leave unchanged and explain                 |

An issue is `resolvable` only when all of these hold:

- the root cause is understood;
- the fix is present on the relevant mainline;
- that fixed version is deployed or released to the runtime that produced the
  issue;
- no matching production event appeared after that deployment;
- the observation window completed — 24 hours with zero matching events after
  the fixed version became active.

For mobile incidents a merge to `main` is not enough. Wait until a release
carrying the fix is actually distributed, then observe the same 24 hours.
Quiet alone never proves repair when the fix has not reached production.

## Sentry resolution rails

`ops_resolve_sentry_issue` has two distinct authorization rails:

- **Verified fix** — omit `delegatedBy`. `ops_claim_resolution` refuses unless the
  incident carries a fix registered through `ops:operator --record-fix`, reached
  `verified`, and has a passing verification from the last five minutes. Triage
  cannot create that state from a conversation, so in practice this rail belongs
  to the operator runner.
- **Operator delegated dead history** — set `delegatedBy` only to the person who
  explicitly asked in this conversation. It drops the fix/verification
  requirement and keeps one provider-proven precondition: the server re-reads the
  issue from Sentry and refuses if it fired within 24 hours. Delegation cannot
  make a live issue historical.

Never invent delegation. It becomes durable audit history under
`state='closed_by_operator'` with the delegator named as `actor`.

## Unreachable failures are not backlog

Some failures cannot be acted on by any available operator action. Repeatedly
turning them into backlog items is a producer bug, not useful work.

A podcast render on a superseded `EPISODE_VIDEO_VISUAL_VERSION`, or an episode
with `abandoned_at`, cannot be resumed by the normal retry RPCs. Reviving one
forces a new visual plan and Brave spend, so it is an operator spending decision,
not weak-agent queue cleanup.

Inactive priority accounts are likewise a pricing/product decision rather than a
defect and must not become incident backlog.

More generally, if no reachable action can clear a signal, classify the signal
producer or presentation as the defect instead of creating one issue per stale row.
