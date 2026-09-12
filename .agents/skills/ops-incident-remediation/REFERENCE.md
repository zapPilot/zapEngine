# Incident reference

### Which rail to resolve on

`ops_resolve_sentry_issue` has two rails (`apps/control-center/MCP.md`, "Two
resolution rails"). Pick by what actually authorizes the close:

- The gate above passed on production evidence — omit `delegatedBy`.
- A person in this conversation told you to close it, and there is no deployed
  fix to verify because the issue is dead history (its cause was abandoned,
  removed, or fixed long ago) — set `delegatedBy` to who asked.

Only ever set `delegatedBy` when a person actually asked, in this conversation,
and name them. It writes a human decision into the audit trail; setting it on
your own initiative forges one. The 24-hour quiet check still applies and is
enforced against Sentry, so an issue that is still firing cannot be closed on
either rail.

## Unreachable failures are not a backlog

Some rows are failures no operator action can reach. Repeatedly deferring them
one at a time is the wrong answer: fix the surface that reports them, or leave
them alone entirely.

A **podcast render failure on a superseded `EPISODE_VIDEO_VISUAL_VERSION`**, or
on an episode with `abandoned_at` set, can never be requeued — both retry RPCs
refuse it. Reviving one means `retry_episode_video_generation(p_force_replan =>
true)`, which re-runs the storyboard, subject catalog and full Brave budget: a
per-episode spend decision that belongs to a human, never to queue-clearing. Do
not propose a "bounded retry" for these, and do not read a pile of them as an
incident backlog. `apps/control-center/MCP.md` ("What never becomes a signal")
holds the fence.

**Inactive priority accounts** (`customer-economics:waste/*`) are a pricing
question, not a defect, and are deliberately no longer emitted as a signal. If
one reappears, the bug is the emitter.

More generally: when a signal cannot be cleared by any action available to
anybody, the defect is that it was reported as an incident. Say so, and fix it
there — one such fix counts as this run's repair.
