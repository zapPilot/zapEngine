---
name: review-pr
description: >-
  Use when reviewing an existing ZapEngine pull request from a PR number or URL,
  especially after another agent created the implementation. Checks out the PR
  head in the current isolated worktree and reviews the implementation against
  the PR description, repository invariants, and executable evidence.
---

# Review an existing PR

Use the PR description as the review contract and the repository as the
implementation truth.

The invocation argument must include a PR number or GitHub PR URL. Extra text may
narrow the review or explicitly ask for fixes.

## Core rules

- Do not create another worktree. The caller is expected to invoke this skill
  from the worktree they want to use for review.
- Invoking this skill explicitly authorizes switching this current worktree to
  the target PR head branch. It does not authorize reset, rebase, force-push,
  history rewriting, or discarding user-owned changes.
- If local changes would be overwritten by checkout, stop and report the exact
  conflict. Never hide them with `reset`, `clean`, or an implicit stash.
- The PR body is a contract to verify, not proof that the implementation is
  correct. Checked acceptance boxes are claims until code/tests/runtime evidence
  prove them.
- Follow root `AGENTS.md` and every nearest scoped `AGENTS.md` that applies to
  changed files.
- Review the actual PR diff against its declared base. Do not substitute current
  `main` when the PR targets another base.

## Establish the PR and checkout

Resolve the PR from the invocation argument:

```bash
gh pr view <pr> --json \
  number,url,title,body,state,baseRefName,baseRefOid,headRefName,headRefOid
```

Record the PR number, URL, base ref/OID, head ref/OID, and body before reviewing.
Reject a closed or merged PR unless the caller explicitly asked for historical
review.

Before switching, preserve evidence about the current worktree:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list --porcelain
```

Then check out the PR in this worktree:

```bash
gh pr checkout <pr>
```

After checkout, verify that local `HEAD` equals the PR's `headRefOid` from
`gh pr view`. If it does not, fetch and diagnose the mismatch before reviewing;
do not silently review stale code.

## Build the review contract

Read the entire PR body. Extract the parts that define intended behavior,
including when present:

- intent / problem statement;
- production evidence and reproduced failure mode;
- scope and out of scope;
- source-of-truth or state-model claims;
- product / architecture invariants;
- rollout and migration ordering;
- retry, concurrency, authorization, or failure semantics;
- acceptance criteria;
- explicit reviewer notes and high-risk boundaries;
- validation claims and known gaps.

If the PR body conflicts with current repository evidence, call out the conflict
rather than changing the review target to match the prose.

## Inspect implementation truth

Establish the exact changed-file set and diff from the PR's recorded base OID:

```bash
git diff --stat <baseRefOid>...HEAD
git diff --name-status <baseRefOid>...HEAD
git diff <baseRefOid>...HEAD
```

For changed areas, read the relevant implementation, callers, tests, config,
workflows, migrations/schema, deployment configuration, and nearest scoped
instructions. Follow references far enough to verify behavior at boundaries;
do not review only the edited lines when correctness depends on unchanged code.

Check especially for:

1. correctness and data-loss bugs;
2. violated repository or product invariants;
3. acceptance criteria that are missing or only partially implemented;
4. concurrency, lease, transaction, idempotency, and ordering hazards;
5. authorization, credential, or trust-boundary regressions;
6. rollout / migration compatibility and mixed-version windows;
7. source-of-truth duplication or stale derived state;
8. error handling that converts terminal failure into indefinite progress;
9. destructive recovery that should preserve valid checkpoints;
10. missing regression tests for the reported production failure.

Prefer concrete findings with a reproducible failure path over stylistic
comments or speculative refactors.

## Verify findings

For each material finding, use the narrowest repository-native executable check
that can prove or disprove it. Run focused tests first. Before final handoff, run
one appropriate aggregate gate for the affected scope when practical, following
root and scoped verification rules.

Do not weaken tests, validation, typing, CI gates, or security boundaries to make
an implementation satisfy its PR description.

## Fix mode

Review-only is the default.

Modify the PR branch only when the caller explicitly asks to fix, modify, patch,
or otherwise apply review findings. In fix mode:

- fix only findings that are supported by repository evidence;
- keep the existing PR scope unless a related root-cause fix is required;
- add or update regression tests where practical;
- preserve unrelated worktree changes;
- verify the fix;
- commit and push to the same PR branch, never open a second PR;
- follow the root `AGENTS.md` GitHub identity checks before the first commit or
  GitHub write.

Do not merge the reviewed product PR unless the caller explicitly asks.

## Handoff

Report findings in severity order and distinguish:

- confirmed defects;
- contract items verified by code/tests;
- fixes applied, if fix mode was requested;
- validation commands and results;
- anything that could not be verified;
- PR URL and reviewed head SHA.

If there are no material findings, say so explicitly and still report the
verification performed.

## Invocation context

$ARGUMENTS
