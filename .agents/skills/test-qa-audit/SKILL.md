---
name: test-qa-audit
description: >-
  Use for the hourly repository-wide test-quality audit after supported coverage floors are already at 100%.
---

# Test-QA hourly audit

## Where the signal already is

- Durable audit state: newest main `test-qa-state` Actions artifact.
- Coverage regressions: newest **main** `coverage-handoff` artifact.
- Scope picker: `node scripts/agents/test-qa-select.mjs --state <state.json> --limit 3`.
- Enforcement: `node scripts/agents/test-qa-guard.mjs --base <base>`.
- Detailed audit checks and artifact commands: `REFERENCE.md`.

## Core principle

Audit tests for real behavioral value. Phase 1 may change tests and test helpers
only. Never change production code, global test setup, coverage configuration,
thresholds, type/lint gates, or coverage-ignore directives.

A clean audit is useful work. Do not manufacture a diff.

## One-worker ownership

- There may be only one open `test-qa/*` worker branch/PR at a time.
- On a shared checkout, work in an isolated worktree based on current main.
- The worker PR targets `main`, has label `test-qa`, and its title starts
  `[test-qa-hourly]`.
- Never merge the worker PR. A human or separate merge policy owns merging.
- Never use a `backlog/*` branch or add `Agent-Backlog-PR: true`.
- Keep at most 5 audited scopes or 1,000 changed lines in the PR.

## Every run

1. Read the newest main `test-qa-state` and main `coverage-handoff` artifacts.
   Filter coverage artifacts by `head_branch == main`; sort artifact ids locally.
2. If the prior worker run id is missing from state, resend that run's records
   before doing new work.
3. Handle responsibility before new scopes:
   - a real main coverage regression in `incompleteWorkspaces`;
   - CI failures caused by the worker PR;
   - review comments on the worker PR.
     `partial` or `missingReports` alone is missing evidence, not regression.
     Skip a regression already owned by an open `agent-backlog` issue.
4. Do not push when PR CI is still running, the PR hit its size/scope cap, the PR
   has `blocked`, or it conflicts with main. Auditing and state recording may
   continue.
5. After three consecutive worker-caused red CI rounds, add `blocked`. Continue
   audit-only until a human removes that label.
6. Select up to three scopes with:
   `node scripts/agents/test-qa-select.mjs --state <state.json> --limit 3`.
7. Read every selected test plus its `relatedPaths`. Classify each finding:
   - `test`: fix now if verification is available.
   - `production`: record only; Phase 1 cannot change it.
   - `bug`: open an issue with `bug` + `test-qa`, include a stable
     fingerprint, and record the issue number. Never add `agent-backlog`.
     Do not publish sensitive details.
8. If the environment cannot execute a scope's tests (for example a required
   PostgreSQL integration fixture is unavailable), audit and record it but do
   not change that scope.
9. For changed tests, run the selector-provided scoped test and scoped coverage
   commands, then type-check, ESLint/Ruff, Prettier where applicable, and
   `dup:check`.
10. Stage new files, then run `node scripts/agents/test-qa-guard.mjs --base <PR-base>`.
11. Commit, rerun the gates after commit because lint-staged can modify files,
    then push only to the single worker PR. Never merge it.
12. Always record this run, even with no changes, and dispatch
    `test-qa-state.yml` with the records.

## Scope/state rules

A scope is one primary production subject plus all tests primarily testing it.
The selector groups imports and computes a content fingerprint over test files
and related production paths.

Selection order is:

1. deferred `test` findings;
2. never-audited scopes, highest smell/coverage-name risk first;
3. scopes whose fingerprint changed since audit, oldest audit first;
4. unchanged scopes not audited for more than 30 days, oldest first.

`pending` scopes are not selected. A rejected scope stays skipped until its
main fingerprint changes from the baseline captured when rejection is reconciled.

## Rationalizations — STOP

| Temptation                                  | Required response                                                     |
| ------------------------------------------- | --------------------------------------------------------------------- |
| "Coverage is 100%, so this test is fine."   | Audit assertions, inputs, mocks, and behavior.                        |
| "Production cleanup makes the test easier." | Record `production`; do not edit it in Phase 1.                       |
| "This impossible branch needs `as never`."  | Verify the contract; do not force fake states merely for coverage.    |
| "A skip/ignore is temporary."               | Guard forbids new skips, focus markers, ignores, and TS suppressions. |
| "CI is red, but another push may fix it."   | Diagnose; after three worker-caused red rounds, block the PR.         |
| "No diff means the hour was wasted."        | Record a clean audit.                                                 |
| "The worker can merge once green."          | Never merge.                                                          |

## Verification

For any changed scope, all executable selector-provided commands must pass,
followed by:

```bash
node scripts/agents/test-qa-guard.mjs --base <base>
git diff --check
```

Before handing off a worker implementation change, also run the repository
contract and schedule checks described in `REFERENCE.md`.
