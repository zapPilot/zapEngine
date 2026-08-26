---
description: "Fix CI failures completely: reuse existing fixes, ship them, and verify the decisive GitHub SHA is green"
---

Immediately call the `set_goal` tool to start an autonomous goal for this session, passing:

- `maxTurns: 40`
- `maxDurationMs: 3600000`
- `maxTokens: 400000`

A full diagnose + fix + push + PR + merge + post-merge CI-watch cycle may exceed plugin defaults.

# Objective

Fix all GitHub CI failures for the current branch or PR.

Do not merely produce a green local tree or a green CI-fix PR.

For a normal feature PR, success means that PR's current HEAD is green.

For `main`, success means the fix has been merged and the resulting current
`origin/main` HEAD has a decisive green GitHub CI run.

# Definition of done

These are the ONLY valid `[goal:complete]` conditions.

## Starting branch has an open PR

All required checks for the PR's current pushed HEAD pass:

```bash
gh pr checks
```

Capture the PR URL and pushed HEAD SHA in `[goal:evidence]`.

Do NOT automatically merge a normal feature/product PR merely because CI is green.

## Starting branch is `main`

A green CI-fix PR is NOT completion.

Completion requires ALL of:

1. The CI fix PR has been merged into `main`.
2. `git fetch origin` shows the new `origin/main` HEAD.
3. A completed GitHub Actions run exists whose `headSha` is exactly that
   `origin/main` HEAD.
4. Every required job in that run passes.
5. The decisive run URL is captured in `[goal:evidence]`.

If the fix PR is green but cannot be merged because of permissions, required
review, branch protection, or another external blocker, end `[goal:blocked]`,
not `[goal:complete]`.

Local green is NEVER completion evidence.

`pnpm verify changed` and `pnpm verify branch` are diff-scoped and may run
nothing when there is no relevant diff.

# Phase 0 — Establish immutable state

Before diagnosing anything:

```bash
git fetch origin
git branch --show-current
git status --short
git rev-parse HEAD
git rev-parse origin/$(git branch --show-current) 2>/dev/null || true
gh pr view --json number,url,state,baseRefName,headRefName,headRefOid 2>/dev/null || true
```

Record:

- `START_BRANCH`
- `START_LOCAL_HEAD`
- `START_REMOTE_HEAD`
- dirty working-tree state
- whether the starting branch has an open PR

Never assume local HEAD and GitHub HEAD are the same.

For CI diagnosis, GitHub's pushed SHA is authoritative.

If `START_BRANCH=main` and local `main` is ahead of, behind, or otherwise differs
from `origin/main`, do NOT treat the local commits as part of the CI fix unless
they already exist on `origin/main`.

Do not accidentally ship unrelated local commits.

# Phase 1 — Select the decisive GitHub failure

## Open PR

Use:

```bash
gh pr checks
gh pr view --json url,headRefOid
```

The PR's current `headRefOid` is the decisive SHA.

## `main`

Use the remote branch, not local HEAD:

```bash
git fetch origin
REMOTE_HEAD=$(git rev-parse origin/main)

gh run list \
  --branch main \
  --limit 10 \
  --json databaseId,headSha,status,conclusion,createdAt,url
```

Select the newest relevant run whose `headSha` matches `REMOTE_HEAD`.

Do NOT diagnose an older run as though it were current.

If the exact remote HEAD run is queued or in progress, poll it before editing.

Each goal turn should perform at most one CI poll, for example:

```bash
sleep 60
gh run view <run-id>
```

Then end that turn with one short status update.

Do not use one long blocking `gh run watch`.

# Phase 2 — Reuse an existing CI fix before creating another one

This step is mandatory when fixing `main`.

Before creating any new `fix/ci-*` branch:

```bash
gh pr list \
  --base main \
  --state open \
  --json number,url,title,headRefName,headRefOid
```

Look for existing CI-fix PRs, especially branches named:

```text
fix/ci-*
```

For candidates inspect:

```bash
gh pr view <number> \
  --json number,url,title,body,baseRefOid,headRefOid,mergeable,mergeStateStatus

gh pr checks <number>
```

A PR is a matching existing fix if either:

- its body contains `CI-Fix-Base: <DECISIVE_SHA>`, or
- for older PRs without the marker, its `baseRefOid` equals the decisive failing
  SHA and its diff clearly addresses the current failures.

A branch whose commits are prefixed `fixCI` (see Phase 7) is also a strong
signal of a prior goal-ci-fix repair — inspect it before creating a competing
fix.

If more than one matching PR exists, prefer:

1. exact `CI-Fix-Base` match,
2. green checks,
3. newest adequate fix,
4. smallest/root-cause-focused diff.

Never create a new CI-fix PR when an existing matching PR already contains the
required fix.

## Existing matching PR is green

Inspect its diff for unrelated changes.

If it is a clean, scoped CI fix targeting `main`, merge it according to
Phase 7, then verify post-merge `main`.

Do not create another fix branch.

## Existing matching PR is red

Reuse that branch and continue fixing it.

Do not create another competing CI-fix PR.

If switching the current checkout would overwrite unrelated local work, use a
safe isolated git worktree for that PR branch instead. Follow the repository
root `AGENTS.md` working-tree and history rules; do not duplicate or override
them here.

## Existing matching PR is obsolete or unrelated

Document why, then proceed to create one new fix branch.

# Phase 3 — Enumerate ALL current failures

For the decisive run:

```bash
gh run view <run-id> \
  --json jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | .name'

gh run view <run-id> --log-failed
```

Enumerate every failing job before editing.

The user-provided failure is only a hint, never the scope.

Classify errors by actual failure signature, not job label.

For example, a job named `coverage` may actually have failed because a test
crashed before coverage thresholds were evaluated.

Deduplicate failures that share one root cause.

# Phase 4 — Read the correct skills

Always read first:

```text
.agents/skills/monorepo-ci-debugging/SKILL.md
```

Then route specialized failures:

- coverage / coverage threshold:
  `.agents/skills/monorepo-coverage-gate/SKILL.md`
- TS2307 / build / import:
  `.agents/skills/monorepo-build-import-errors/SKILL.md`
- Playwright / app e2e:
  `.agents/skills/app-playwright-ci-debugging/SKILL.md`
- analytics / Python / contracts:
  `.agents/skills/analytics-engine-ci-debugging/SKILL.md`
- dup:check:
  `.agents/skills/monorepo-dup-check/SKILL.md`
- lint / format loops:
  `.agents/skills/monorepo-lint-format-loop/SKILL.md`
- security:
  `.agents/skills/monorepo-security-audit/SKILL.md`
- env drift:
  `.agents/skills/env-drift-ci-debugging/SKILL.md`
- desktop:
  `.agents/skills/desktop-ci-debugging/SKILL.md`

Follow root `AGENTS.md` and the nearest scoped `AGENTS.md`.

# Phase 5 — Fix the whole failure batch

Fix root causes only.

Never:

- weaken CI gates,
- lower thresholds,
- add coverage ignores merely to pass CI,
- suppress type errors,
- add `@ts-expect-error` merely to pass CI,
- modify `scripts/lint/*`,
- modify `scripts/verify-*.sh`,
- perform analytics-engine write operations.

Before editing, check whether the failure was caused by a non-atomic previous
commit:

- test committed without required implementation,
- generated artifact committed without source update,
- implementation left only in the working tree,
- local validation included uncommitted code that GitHub never received.

A CI fix commit must be self-contained.

Tests that require a new implementation and that implementation must ship
together.

# Phase 6 — Verify with CI parity

Use the authoritative mapping in
`.agents/skills/monorepo-ci-debugging/SKILL.md`.

Current examples:

```bash
# quick-gates
bash scripts/verify-jobs.sh format repo contracts

# code-quality
bash scripts/verify-jobs.sh type-check lint deadcode dup

# tests
bash scripts/verify-jobs.sh test analytics

# e2e
bash scripts/verify-jobs.sh e2e

# coverage
pnpm run coverage test &&
pnpm turbo run test:coverage &&
pnpm exec tsx scripts/coverage-summary.ts

# security
pnpm run security audit

# env drift
pnpm lint dead-env
```

Run FULL parity for every job that was red.

`pnpm verify changed` / `pnpm verify branch` are additional safety only when a
real diff exists.

They never replace the previously-red job's full parity command.

Turbo cache may replay stale green.

For the actual fixed workspace/task, confirm at least once cache-free using one
of:

```bash
pnpm --filter @zapengine/<pkg> run <task>
```

or:

```bash
pnpm turbo run <task> --force
```

`.ai-verify/result.json` and `.ai-verify/logs/` are fallback evidence only when
GitHub CLI is unavailable.

If used, compare their mtimes against the relevant HEAD commit before trusting
them.

# Phase 7 — Ship

Commit only files changed for this CI fix.

Leave unrelated working-tree changes untouched.

## Commit style (required)

Every CI-fix commit MUST start with the `fixCI` prefix, conventional-commit
style after it:

```text
fixCI(podcast): dedupe classroom language code parser
fixCI(ci): unblock coverage gate
```

The `fixCI` prefix marks the commit as produced by this goal-ci-fix command.
It is required, not optional — future iterations of this command recognize and
iterate on `fixCI` commits (identifying existing fix branches/PRs, skipping
already-fixed root causes). Keep the rest of the message a short root-cause
summary, not a symptom list.

## Starting branch has an open PR

Commit the fix to that same branch.

Push it.

Record the pushed HEAD:

```bash
git rev-parse HEAD
```

Then poll:

```bash
gh pr checks
```

until all required checks for that exact HEAD are green.

Do not open a second PR.

Do not merge the user's normal feature PR automatically.

## Starting branch is a non-main branch without a PR

Commit only the fix.

Push to the same branch.

Watch the GitHub Actions run whose `headSha` equals the pushed HEAD.

A completed green run on that exact SHA is completion evidence.

## Starting branch is `main`

NEVER push commits directly to `main`.

### If a matching CI-fix PR already exists

Reuse it.

Do not create another branch or PR.

### Otherwise

Invoking `/goal-ci-fix` explicitly authorizes creation of exactly one CI-fix
branch when no matching branch or PR exists. Follow the repository root
`AGENTS.md` working-tree and history rules, then create it from authoritative
remote main:

```bash
git fetch origin
git switch -c fix/ci-<topic> origin/main
```

Commit only the CI fix.

Before the first commit or GitHub write, perform the identity checks in the
repository root `AGENTS.md` "GitHub identity" section. Push over HTTPS with the
active `gh` credential so the employer SSH identity can never become the
recorded pusher:

```bash
git -c credential.helper='!gh auth git-credential' \
  push https://github.com/<owner>/<repo> fix/ci-<topic>
```

Open a PR whose body includes:

```text
CI-Fix-Base: <DECISIVE_SHA>
CI-Fix-Run: <DECISIVE_RUN_URL>

Root causes:
- ...

Verification:
- ...
```

Example:

```bash
gh pr create \
  --base main \
  --head fix/ci-<topic> \
  --title "fix(ci): <short root cause>" \
  --body "<body>"
```

Poll that PR until every required check is green.

# Phase 8 — Merge CI-fix PRs into main

This auto-merge permission applies ONLY to scoped `fix/ci-*` PRs whose purpose is
repairing `main` CI.

It does NOT apply to normal feature/product PRs.

Before merging confirm:

- base is `main`,
- branch is `fix/ci-*`,
- all required PR checks are green,
- PR contains only the intended CI/root-cause fix,
- no unrelated working-tree files were committed,
- merge state is clean enough to merge.

Then merge using the repository's normal merge strategy.

If no repository-specific strategy exists, prefer squash:

```bash
gh pr merge <number> --squash --delete-branch
```

If GitHub refuses the merge because of permissions, required review, branch
protection, or merge conflicts:

- do not create another CI-fix PR,
- report the exact blocker,
- give the exact required next command/action,
- end `[goal:blocked]`.

A green but unmerged CI-fix PR is NEVER `[goal:complete]`.

# Phase 9 — Verify main after merge

After the CI-fix PR is merged:

```bash
git fetch origin
MAIN_HEAD=$(git rev-parse origin/main)

gh run list \
  --branch main \
  --limit 10 \
  --json databaseId,headSha,status,conclusion,createdAt,url
```

Find the run whose:

```text
headSha == MAIN_HEAD
```

If queued or in progress, poll once per goal turn.

If it fails:

1. enumerate ALL new red jobs,
2. determine whether they are new failures or incomplete fixes,
3. continue the SAME goal,
4. reuse the SAME fix PR if still open, otherwise create at most one follow-up
   CI-fix PR for the new `main` SHA.

Do not declare success because the pre-merge PR was green.

Only the exact current `origin/main` HEAD green run completes a main CI repair.

# Checkout cleanup

Follow the repository root `AGENTS.md` working-tree and history rules. Restore
the starting checkout only when safe, and never discard user-owned work during
cleanup.

# Closing protocol

## Success

Output:

```text
[goal:evidence]

Starting branch:
Starting remote SHA:
Root cause(s):
Files changed:
Local parity commands:
PR:
Merged commit / resulting main HEAD:
Decisive GitHub run:
Per-job result:

[goal:complete]
```

Only emit `[goal:complete]` when the Definition of Done is satisfied.

## Blocked

Immediately before stopping, output:

```text
[goal:evidence]

Work completed:
Verification completed:
PR / branch:
Current decisive SHA:
Concrete blocker:
Exact next command/action:

[goal:blocked]
```

Never substitute `[goal:complete]` for an external action that has not actually
happened.

# Extra user context

$ARGUMENTS

After `set_goal` succeeds, begin working immediately.
