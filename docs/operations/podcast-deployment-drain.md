# Podcast deployment drain

`podcast-pipeline` shares one Fly app between the always-on API process and the
long-running render process. Fly sends SIGINT while replacing a Machine. A
render can run far longer than `kill_timeout = 30s`, so a rollout must never be
allowed to discover an active render by signalling it.

## Normal code deploy / environment apply

Both `.github/workflows/deploy-fly.yml` and the `podcast-pipeline` lane of
`.github/workflows/env-apply.yml` use the same DB-backed gate:

1. acquire a fenced deployment owner (`deployment_id` + `owner_token`);
2. atomically change the gate from `open` to `draining` under the same advisory
   transaction lock used by both render claim RPCs;
3. wait until live video + shared-visual leases are zero and the render Machine
   is stopped for two consecutive checks;
4. change `draining -> rolling_out` (the RPC rechecks live leases);
5. perform the Fly code rollout or immediate env apply;
6. verify the app/render fleet is on one image and an app Machine is started;
7. change `rolling_out -> open`.

The drain limit is 100 minutes. Podcast workflow jobs have a 150-minute timeout.
A drain timeout happens before rollout and reopens only the same owner's gate.
A failure after rollout begins leaves `recovery_required` instead. A stale
heartbeat never reopens claims automatically.

The claim wrappers are backward-compatible with the previous worker release.
An old worker may finish and renew the lease it already owns, but once the gate
is `draining` its next claim returns no row. Requiring the render Machine to
stop naturally also proves its current job's cleanup and fire-and-forget cost
recording path has returned before Fly replaces it.

The always-on render-capacity reconciler reads the same gate and returns an
empty work snapshot while claims are closed, so it cannot wake a stopped render
Machine during drain. If the gate RPC cannot be read, the reconciler fails
closed and does not wake capacity.

## Recovery

Do not reopen the gate merely because a Machine is stopped or a heartbeat is
old. First establish that no GitHub deployment/environment workflow still owns
the rollout and that the Fly app/render fleet is converged. Then use the exact
fenced deployment id and target release printed by the failed workflow:

```bash
node scripts/env/run.mjs --environment prod -- \
  node scripts/podcast-deployment-gate.mjs recover \
  --deployment-id <uuid> \
  --release <git-sha>
```

The CLI independently refuses recovery unless Fly reports a converged app/render
fleet and a started app Machine. The DB RPC also refuses an id/release which does
not exactly match the `recovery_required` row.

To inspect the DB state without changing it, use the service-role RPC
`from_fed_to_chain.podcast_deployment_state()` from the normal ops environment.
Do not add an automatic stale-heartbeat unlock.

## First rollout

The DB migrations must be applied before the worker/code rollout. The first
migration wraps the old claim RPC names, so it immediately blocks new claims
from the currently running release. The deploy workflow then waits for any old
render to finish and stop normally before replacing it. If that cannot be
observed within the drain budget, abort the rollout; do not force-stop the
Machine.

Subsequent migrations must preserve the DB contracts used by the release that
can still be draining. Destructive schema changes belong after a later rollout,
not before the compatibility window closes.

## Cost semantics

`retryWasteUsd` is retained temporarily as a JSON compatibility alias, but it is
**failed-attempt cost**: priced stages attached to a failed parent run. The UI no
longer calls it confirmed waste.

New render/shared-visual claims receive durable `execution_id` and
`previous_execution_id` values. New stage rows are enriched with a stable
`work_key`. Confirmed retry waste can therefore be a conservative lower bound:
an earlier priced execution counts only when a later `executed` successor points
to it and has the exact same work key. Historical rows are not guessed into
lineage. Missing lineage, unpriced stages, and missing failure reasons remain
explicit unknowns.

Future interrupted-attempt attribution uses runtime evidence (`shutdown` or
`deploy_shutdown`) rather than attempt counters. `deploy_shutdown` is only
written when a shutdown is observed while a concrete deployment id is already
in rollout/recovery state.

## Production acceptance

After merge, validate both paths with real active work:

- a code deploy started while a render is active;
- a podcast environment apply started while a render is active.

For each, the original execution must finish before Fly replaces its Machine,
no deployment-created retry should appear, and the worker must resume claiming
after the gate reopens. Observe the release for at least 24 hours after those
rollouts before treating the historical deployment-SIGINT incident as resolved.
