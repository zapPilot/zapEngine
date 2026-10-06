# GitHub Security integration verification

Verified on 2026-10-04 (Asia/Tokyo), in the existing clean `main` checkout.
`git fetch` confirmed remote main had no competing implementation. No branch,
commit, PR, deployment or alert mutation was made. GitHub PAT alert-read
permissions were subsequently updated with explicit user authorization.

## Behavior

The shared control-center collector feeds the existing snapshot, security domain,
MCP projections and Reliability page. Each configured surface contributes exactly
one rollup or source-failure signal. Unconfigured tokens send no requests. All
security requests are GET without bodies; pagination is capped at two pages and
rejects external origins. Secret pagination preserves `hide_secret=true` on every
page, including when a next link omits it. Schemas strip unknown fields and
outputs project allowlisted metadata. The secret location schema follows the
[GitHub REST response](https://docs.github.com/en/rest/secret-scanning/secret-scanning).

## Checks

- Baseline: 1,999 tests, type-check, lint and deadcode passed. Contrary to the
  anticipated baseline, local deadcode was green.
- Final: 2,083 tests; statements, branches, functions and lines all 100%.
- Turbo test/type-check/lint passed; the final added HTTP-header test also passed.
- control-center `dup:check`: zero clones.
- Turbo deadcode: passed, matching baseline.
- `pnpm lint config`: passed.
- `pnpm format check`: passed across all 15 workspaces.
- Playwright: local dashboard, recorded GitHub payload fixtures, security card
  visible and no page errors. Full-page screenshot delivered separately.

Real read-only GitHub payloads were saved in the temporary scratchpad and parsed
by the shared schemas/policy without passing the CLI credential into the app:

| Surface         | Open | Status   |
| --------------- | ---: | -------- |
| Code scanning   |    4 | critical |
| Dependabot      |  133 | critical |
| Secret scanning |    0 | healthy  |

Parsed payloads contained no `secret` field. Dependabot canonicalization yields
35 distinct ecosystem/package names, five manifests and four unpatched alerts.
Its scalar rollup evidence is 332 JSON characters on this inventory.

## Manual mutation checks

Every mutation caused the focused test suite to fail, then was restored:

1. Remove high from CodeQL critical severity.
2. Reverse the test/generated/library classification cap.
3. Change Dependabot's critical-only escalation to high-only.
4. Change secret inactive policy to active.
5. Reverse the fixed/dismissed exclusion.
6. Remove `hide_secret=true`.
7. Restore a `secret` schema field.
8. Replace `followUpTargets` with the rollup fingerprint.

## Production verification and PAT permissions

The canonical prod forced snapshot ran successfully after Infisical login. Before
permission editing, all three Security endpoints returned HTTP 403 and the
repository rollups reported `unknown`, confirming the real unavailable-permissions
path. After editing the existing production PAT, all three endpoints returned
HTTP 200 and the forced snapshot reported:

| Surface         | Open | Status   |
| --------------- | ---: | -------- |
| Code scanning   |    4 | critical |
| Dependabot      |  133 | critical |
| Secret scanning |    0 | healthy  |

Overall remained critical, so the status CLI exited 1 as expected.

The production PAT belongs to `i-xtsu-sixyou-ken-mei`, has GitHub settings ID
`20426832`, and remains scoped to `zapPilot/zapEngine`. Code scanning alerts,
Dependabot alerts and Secret scanning alerts are now Read-only; Actions and
Metadata remain Read-only. Token value, Infisical and Vercel were unchanged.
The old `david30907d` same-named expired PAT (`18915775`) was briefly edited before
the account mismatch was discovered, then completely restored to Actions and
Metadata Read. The final permission change was verified on the correct account
and against the existing Infisical prod token.

After merge, deploy-vercel deploys the code; start a new stdio MCP session to load
0.13.0. Focused tests cover ordinary 403/404, 401, rate-limited 403,
400/422/429/500, timeout, invalid rows and external next origins, preserving
readings from the other surfaces.

## Requested non-expiring tokens: prepared, not submitted

The user subsequently requested No expiration for `OPS_GITHUB_TOKEN` (`20426832`)
and `OPS_GITHUB_BACKLOG_TOKEN` (`19479016`). Both GitHub regeneration forms are
prepared with No expiration selected. GitHub requires regeneration to change
expiration and explicitly warns that consumers must be updated with the new
value. No regeneration has been submitted and no credential values were changed.
The browser credential-change rule requires the user to complete regeneration.
`OPS_GITHUB_TOKEN` is a sensitive control-center key in the canonical manifest;
its replacement must reach Infisical and deployment stores through the canonical
secret rotation rail. `OPS_GITHUB_BACKLOG_TOKEN` is absent from the app manifest,
so its actual consumer/store needs to be identified before replacing its value.

Infisical metadata lookup in the repository's configured project confirmed
`OPS_GITHUB_TOKEN` exists at `/` in both dev and prod. Recursive lookups of those
same two environments did not find `OPS_GITHUB_BACKLOG_TOKEN`. No secret values
were displayed and no secrets were changed. The backlog token may live in a
different project/environment or under another key; its store remains unconfirmed.

The authenticated Infisical UI confirmed this project has Development, Staging
and Production environments. Staging's root is empty. The GitHub tab inventory
still shows both regeneration forms, so the requested non-expiring rotation is
not complete. No credentials were revealed or modified during this check.

The user subsequently confirmed completing the token replacement and deleting
the unused backlog PAT. The updated Infisical prod token returned HTTP 200 for
all three Security endpoints, with no token-expiration response header. Dispatched
Environment apply run `37176604502` on main for `control-center-vercel`; its sync
job succeeded. Normal merge deployment follows successful main push CI, while
secret-only rotations require this separate environment apply dispatch.
