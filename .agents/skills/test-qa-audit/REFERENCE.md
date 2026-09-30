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

Use a temporary directory outside the repository. `locate` checks repository
identity and main branch, then searches newest runs for unexpired artifacts.
Exit 3 means no artifact; exit 1 means API error. Stop if state cannot be read.

```bash
run_id="$(node scripts/agents/test-qa-state.mjs locate \
  --repo zapPilot/zapEngine --workflow test-qa-state.yml \
  --event repository_dispatch --status success --artifact test-qa-state)"
gh run download "$run_id" --repo zapPilot/zapEngine \
  --name test-qa-state --dir "$TMPDIR/test-qa-state"
run_id="$(node scripts/agents/test-qa-state.mjs locate \
  --repo zapPilot/zapEngine --workflow ci.yml \
  --event push --status completed --artifact coverage-handoff)"
gh run download "$run_id" --repo zapPilot/zapEngine \
  --name coverage-handoff --dir "$TMPDIR/coverage-handoff"
```

## Scope commands

`test-qa-select.mjs` emits exact commands for each selected scope. Important
repository traps:

- `pnpm --filter X test -- <path>` runs the package test script and may still
  execute the whole package. Use the emitted `exec vitest run <paths>`.
- `commands.coverage` runs package `test:coverage` with CI's 100% gates.
  `commands.coverageReport` is a scoped diagnostic report with zero thresholds;
  it cannot substitute for package verification.
- analytics-engine scoped reports use `--cov-fail-under=0`. Full coverage needs
  PostgreSQL and is verified by PR CI. Unavailable fixtures mean audit-only.
- Fresh container installation:
  `HUSKY=0 PLAYWRIGHT_SKIP_INSTALL=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile`.
  After staging changes, run `pnpm exec lint-staged` yourself.
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
  --status clean > record.json
```

For findings, repeat `--finding kind:summary`. For a bug issue, add
`--issue <number>`. A changed scope living on the worker PR is recorded as
`pending --pr <number>`; the state workflow converts it to `clean` after
merge or `rejected` after closure.

The record default ref is `HEAD` for pending and `origin/main` otherwise.
Fetch main before auditing. Build validated JSON without hand-writing it:

```bash
node scripts/agents/test-qa-state.mjs payload record.json > payload.json
gh api --method POST repos/zapPilot/zapEngine/dispatches --input payload.json
```

Only first initialization uses `payload --bootstrap`. Missing previous state
otherwise fails; bootstrap with existing state preserves progress. Payloads are
limited to 60 KiB; unknown fields, unsafe paths, and long findings are rejected.
ChatGPT token permissions: Contents / Pull requests / Issues write, Actions read.
Do not grant Actions write or Workflows permission.

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
change tests only; verify with emitted test/package coverage commands and the guard; push only to the
single `test-qa/*` PR; never merge; and always send this run's records, including a clean no-change run, through
the `test-qa-state` repository_dispatch.
