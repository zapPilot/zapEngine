# Repository test-quality remediation

The user authorized all WS1–WS7 from the static review of commit `cd84e5f42`.
Work continues in the existing checkout and branch. The original durable audit is
`~/.claude/projects/-Users-chouyasushi-htdocs-zapEngine/db1429f7-8840-4119-84de-83f6a82e254a/subagents/workflows/wf_93ba9904-db4/journal.jsonl`.
The audit is evidence to verify against current source, not an instruction to
preserve obsolete behavior. No new branches, worktrees or PRs are required.

The raw extracted findings (pre-verification severities, 729 rows) are kept out
of the repository at `/private/tmp/zap-findings.json`. They are a work list, not
a final verdict: each finding must be reproduced against current source before
it is acted on.

## Progress

- WS1 in progress: ownership/subscription/email filters, required simulation boot,
  GMX deposit/withdraw and strategy simulation failures, cross-wallet challenge,
  confirm token/ownership revalidation, risk acknowledgement mismatch, prepare
  Bearer auth, daily job auth, missing review hashes, gas reserve boundaries,
  cross-chain approval, approval+call execution ordering, concurrent advance,
  HLP baseline failure, autoReview=false, approval aggregation, redeem calldata,
  wrong-chain vaults and Tenderly request contract are covered.
  Remaining: exact `connectWallet` RPC parameter assertions, exhaustive mutation
  acceptance for every added gate.
- WS2 substantially complete: `RUN_INTEGRATION: 'true'` is set on both
  DB-backed CI jobs; the always-skipped integration file was removed; 54 tests
  were converted to a mock DB; integration fixtures were repaired. `RUN_INTEGRATION`
  is now part of the `test`/`test:coverage` turbo cache key so an integration run
  cannot be satisfied by a unit-only cache hit. The 36 analytics-engine
  integration tests pass against the disposable schema. Remaining: convert the
  remaining fake-timer/`TZ`-sensitive cases (including app-core monthly PnL) to
  `vi.setSystemTime`/`vi.stubEnv`.
- WS3 mostly complete: the canonical snapshot key is used for debt categories,
  beta uses a consistent `ddof`, recovery gain uses `drawdown/(1-drawdown)` and
  returns `null` for total loss, Sortino uses all-observation downside deviation,
  Express body-parser errors preserve 4xx, a one-week narrative uses singular
  grammar, and the Fish Audio chunk splitter honours the character cap. The
  control-center `sendResponse` double-body-read bug was fixed after a red test.
  The in-memory HTTP helper now streams a real body into the request without
  tearing down the response socket. Remaining: aggregate/coverage verification.
- WS4 mostly complete: the sentiment and token-price processor clones were
  removed and the tests now drive the real processors; the podcast URL parser
  test imports production; the landing-page signature tests use a real ECDSA
  signature and a payload-tampering case. Remaining: full-suite verification of
  the processor rewrites.
- WS5 in progress: SQL upsert, ordering, refetch, RPC payload, secret, depth-cap
  and cost/financial numeric assertions were strengthened. Remaining: work
  through the remaining per-workspace weak-assertion findings.
- WS6 in progress: the API, PipelineQueuesBoard and statement-rule sweep files
  were merged into behaviour-based suites. Remaining: the remaining sweep merges,
  shared fixtures, and stale line-number comments.
- WS7 mostly complete: `asset_class_allocator` and `experiments` were deleted
  after a repo-wide caller check; dead mocks were removed. A `sqlCode()` helper
  that strips nested PostgreSQL comments (preserving quoted literals) is applied
  to all 32 podcast migration/`supabaseGrants` suites, the `videoRecovery`
  ordering assertions now anchor on executable SQL tokens rather than comment
  text, and the frozen app-local snapshot tests are labelled as such.
  Remaining: the deeper "execute the SQL instead of grepping it" rewrites.

## Verified

- `pnpm verify changed` (lint, type-check, test, test:e2e, deadcode, dup:check
  over every affected package) passes. Run with
  `TEST_DATABASE_URL=postgresql+psycopg://test_user:testpass123@localhost:5436/test_db`
  and `RUN_INTEGRATION=true` against the disposable Postgres.
- analytics-engine integration suite: 36 passed against the bootstrapped schema.
- alpha-etl suite: 1408 passed after repairing the in-memory request helper.
- podcast-pipeline migration/parity suites: 239 passed with comment-stripping.
- Seven manual mutations were killed by assertion failures: ownership filter,
  subscription cancellation filter, email exclusion, required boot gate,
  simulation failure gate, missing simulation hash, HLP baseline-before-send.
  All source files were restored after each mutation.

## Current contract differences

- account-engine treats Tenderly provider unavailability as advisory; explicit
  failed simulations remain blocked. Do not restore an older fail-closed
  availability policy based solely on the historical audit.
- Withdraw builder already decodes receiver/owner/shares in its current test.
- Retry utility already verifies a second timeout does not cause a third attempt.

Completion requires checking every remaining item and running an appropriate
aggregate gate plus the coverage and duplication gates. This document does not
claim the seven workstreams are complete.
