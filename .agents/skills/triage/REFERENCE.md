# Triage reference

## Sentry resolution rails

`ops_resolve_sentry_issue` has two distinct authorization rails:

- **Verified fix** — omit `delegatedBy`. The registered fix must be verified in
  production and the server-side quiet gate must pass.
- **Operator delegated dead history** — set `delegatedBy` only to the person who
  explicitly asked in this conversation. The server still requires Sentry to be
  quiet; delegation cannot make a live issue historical.

Never invent delegation. It becomes durable audit history.

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
