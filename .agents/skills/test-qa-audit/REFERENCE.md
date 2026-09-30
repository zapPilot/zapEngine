# Test-QA reference

## Audit checklist

Read the selected tests and their related production subjects together.

Look for:

- assertions that only prove "defined", "truthy", call count, or implementation
  shape when an observable behavior can be asserted;
- mocks/stubs that bypass the behavior named by the test;
- duplicated `.coverageN`, `*-gaps`, `*100*`, or sweep tests that can be
  consolidated without losing behavior or coverage;
- `as never` / `as unknown as` used to manufacture states that validated
  inputs or types cannot produce;
- production code imported only by tests (dead-code tools may count that import
  as usage);
- branch cases that contradict schema, type, route, or query contracts;
- tests whose title claims one behavior while assertions cover another;
- over-broad snapshots or brittle implementation-detail assertions;
- missing boundary/error assertions already implied by the production contract.

Do not turn a production finding into a production edit in Phase 1.

## Artifact download

Use a temporary directory outside the repository. List artifacts, filter to
unexpired main runs, then sort by artifact id locally.

```bash
gh api --method GET repos/zapPilot/zapEngine/actions/artifacts \
  -f per_page=100 --paginate --slurp >"$TMPDIR/zap-artifacts.json"

jq -r '
  [.[].artifacts[]
    | select(.expired == false)
    | select(.workflow_run.head_branch == "main")
    | select(.name == "test-qa-state")]
  | sort_by(.id) | last
  | [.id, .workflow_run.id] | @tsv
' "$TMPDIR/zap-artifacts.json"

gh run download <run-id> --repo zapPilot/zapEngine \
  --name test-qa-state --dir "$TMPDIR/test-qa-state"
```

Repeat the last selection/download with artifact name `coverage-handoff`.
Do not use a PR-run coverage artifact as main state.

## Scope commands

`test-qa-select.mjs` emits exact commands for each selected scope. Important
repository traps:

- `pnpm --filter X test -- <path>` runs the package test script and may still
  execute the whole package. Use the emitted `exec vitest run <paths>`.
- Scoped Vitest coverage uses `--coverage.enabled`,
  `--coverage.include=<subject>`, an external reports directory, and a 100%
  threshold. Python uses `--cov-fail-under=100`. Never lower these thresholds.
  If other tests are needed to cover the subject, include them in verification;
  a failing coverage command is not permission to push.
- analytics-engine uses `exec uv run pytest <tests> -q -m "not integration"`.
  Scopes requiring unavailable PostgreSQL are audit-only.
- Stage new files before running the guard. Without `--head`, it checks the
  working tree against the base and rejects untracked files. CI passes an
  explicit `--head HEAD` to check only the committed merge result.
- After committing, rerun gates: lint-staged may have modified files.
- `dup:check` is not covered by a generic Turbo verification shortcut.
- `pnpm contracts check` rewrites/checks generated contract snapshots; finish
  with a clean `git status`.

## Record and dispatch

Create one record per audited scope. Use the same `worker-run-id` for the
whole hourly iteration. A clean/no-scope iteration can be recorded without
`--key`.

```bash
node scripts/agents/test-qa-state.mjs record \
  --worker-run-id <UTC-to-second-id> \
  --outcome clean \
  --key <scope-key> \
  --status clean \
  --ref HEAD
```

For findings, repeat `--finding kind:summary`. For a bug issue, add
`--issue <number>`. A changed scope living on the worker PR is recorded as
`pending --pr <number>`; the state workflow converts it to `clean` after
merge or `rejected` after closure.

Collect record JSON objects into one JSON array and dispatch:

```bash
gh workflow run test-qa-state.yml \
  --repo zapPilot/zapEngine \
  --ref main \
  -f records='<JSON-array>'
```

The dispatch input is capped below GitHub's 65,535-character limit; the merge
script rejects payloads over 60 KiB, unsafe paths, unknown fields, and long
finding text.

## Worker PR handling

Before selecting new work, query the one open `test-qa` PR. Fix worker-caused
CI and review findings first. If CI is pending, the PR is blocked, conflicts
with main, or the PR already contains 5 scopes / 1,000 changed lines, do not
push another change.

If the same worker-caused failure remains red for three consecutive iterations,
add `blocked`; only audit until a human removes it.

## Bug issue fingerprint

Use a stable hash or identifier derived from the finding's subject/path and
summary so reruns can find the existing issue. Apply labels `bug` and
`test-qa`; never `agent-backlog`.

## Implementation verification

For changes to this test-QA infrastructure itself:

```bash
node --test scripts/agents/*.test.mjs
bash scripts/check-schedules-registry.sh
pnpm --filter @zapengine/control-center exec vitest run \
  src/server/services/operations/topology.test.ts \
  src/server/services/operations/schedule-interval.test.ts \
  src/server/services/operations/github.test.ts
node scripts/agents/test-qa-select.mjs --limit 10
bash scripts/verify-jobs.sh format repo contracts
git status --short
```

## Scheduled-task prompt

Use GitHub on zapPilot/zapEngine. Run exactly one iteration of the hourly
test-QA worker in `.agents/skills/test-qa-audit/SKILL.md` on the latest main
and follow it strictly; where it differs from earlier coverage runs, the skill
wins. Read the newest `test-qa-state` artifact and newest main
`coverage-handoff`; handle the one open test-QA PR before selecting scopes;
change tests only; verify with scoped commands and the guard; push only to the
single `test-qa/*` PR; never merge; and always dispatch `test-qa-state.yml`
with this run's records, including a clean no-change run.
