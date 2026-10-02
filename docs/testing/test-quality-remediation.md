# Repository test-quality remediation

## Review scope and evidence

This is a manual review of the supplied WS1–WS7 plan against the current checkout,
followed by related fixes. The checkout and real Git index are preserved; no
branch switches, published commits, pushes, or history changes are part of this work.
`verify changed` creates unreferenced synthetic commit objects for its diff; it
does not change any branch/ref or the real index.

The historical review covered 1,536 files at `cd84e5f42`. Its raw extraction has
729 rows **before severity verification**; its final report retained 413 findings,
including only six confirmed high findings. These are different populations.
Neither the raw 36 high labels nor the historical workspace grades are current
verified results. This pass does not claim another exhaustive read of all 1,536
files or final disposition of all 729 raw rows.

The existing main already contains the six confirmed high fixes and many other
WS1–WS7 changes. The supplied continuation describes further changes that were
absent from the starting tree. Those descriptions were checked against source,
not accepted as proof that the work was present or verified. Previous gate results
must not be presented as results for this working tree.

## Corrections in this working tree

### Production behavior

- Monthly PnL uses the existing source calendar-date contract instead of the
  host timezone. Regression fixtures straddle month boundaries in UTC, Tokyo,
  and New York and include an invalid month.
- Privy preparation captures a deep copy before its first awaited boundary and
  returns a separate preview. Changing either the caller's request or returned
  typed data cannot change the reviewed batch that is submitted. Confirmation
  rechecks preview expiry after awaited ownership/signature verification.
  A preview is consumed once, and a wallet lock prevents two reviewed batches
  from submitting concurrently with the same nonce. Failed submission releases
  that lock so a valid preview can be retried. Re-simulation must preserve both
  the simulation fingerprint and risk hash; a risk-only change returns a new
  review instead of executing under the old acknowledgement.
- HTTP execution normalizes errors before deciding whether to retry. Previously
  a 503 or timeout escaped before retry handling. Tests cover exact exponential
  delays, client errors, retry exhaustion, real abort deadlines, fresh retry
  signals, final error type, and timer cleanup. Caller cancellation stops
  immediately without retrying; already-aborted signals never send a request.
  The timeout controller also forwards an already-aborted external signal.
- HLP confirmation shares the active submission promise. Two simultaneous calls
  send one vault transfer. A rejected attempt releases the lock; settling an old
  aborted attempt cannot release a newer run's lock.
- Target allocation rejects non-finite weights and scales finite weights before
  summing, so large finite inputs cannot overflow into zero/NaN targets. Display
  stable/alt values are also scaled before combining. This makes the normalized
  finite-weight invariant explicit before removing the redundant second cash
  fallback; the earlier assumption without overflow handling was incomplete.
  Regression tests cover extreme finite values, NaN/infinities, supported asset
  keys, tiny weights, negative-weight clamping, and display mapping.

### Assertions and realistic execution

| Area                        | Current correction                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| account-engine wallet RPC   | Exact function and free-plan parameters                                                                                                              |
| Privy authorization         | Real EIP-712 signatures: valid, wrong signer, changed risk and calls hashes; exact submitted payload                                                 |
| Telegram token              | Exact table, timestamp, token filter, expiry, generation cutoff, and inserted fields                                                                 |
| Telegram settings/trades    | Exact user/chat/channel/token and duplicate-trade filters                                                                                            |
| QuickChart                  | Decoded production URL/config: labels, ordering, sampling, chart type, values and bar colors                                                         |
| Job processor               | Success despite cleanup failure and final retry-count boundary                                                                                       |
| alpha-etl retries           | Exact delay boundaries under production delay behavior, with restored environment                                                                    |
| DMA                         | First 200-day mean, next rolling mean, ratios, unavailable rows, and all three write batches                                                         |
| CoinMarketCap               | Individually invalid required fields in an otherwise valid quote payload                                                                             |
| Sentiment upsert            | Conflict key, update clauses, bound payloads, realistic PostgreSQL affected-row semantics                                                            |
| Historical prices           | Unambiguous day/month fixture and exact ISO date                                                                                                     |
| Borrowing API               | Real BorrowingService computes sorting, aggregates and status instead of a handwritten response clone                                                |
| Wallet category SQL         | Execute the shipped query against PostgreSQL with old/latest/zero-value/foreign-wallet rows                                                          |
| Snapshot integration        | Distinct ingestion timestamps within the same day, exact single-row result                                                                           |
| Analytics lifecycle         | Actual CORS, required route registration and exception-handler keys; remove uvicorn mock tautology                                                   |
| Analytics user identity     | Exact user and snapshot-date arguments to real orchestration collaborators                                                                           |
| Desktop bridge              | Fresh mount after bridge installation and unconditional callback assertions                                                                          |
| Control-center operator SQL | Real PGlite call reaches PII rejection with a valid service; positive control                                                                        |
| Abandon video               | Exact episode scope and original-marker preservation guards                                                                                          |
| Bridge reset                | Valid executable wallet and actual executor spy; reset must prevent sending                                                                          |
| Reviewed batch              | Failed executor clears dedupe state and allows retry                                                                                                 |
| Agent expiry                | Different address and exact safety-margin boundary                                                                                                   |
| Income estimate             | Independent numeric expected values                                                                                                                  |
| Intent plans                | Mixed-case approval cap, isolated zero-minimum failure, product-specific registry selection                                                          |
| GMX builders                | Decode withdraw recipient/market/fee and assert full oracle min/max values                                                                           |
| Rednote topic selection     | Fake row list actually applies exact-name and new-topic filters; no click for prefix collisions or new topics                                        |
| Ingest queue                | Replaced assertion-free stale-cleanup test with a replacement-entry scenario and observable duplicate admission assertions                           |
| Fly billing daemon          | Remove unused real collector import; fake timer verifies two-cycle sleep boundary and prevents timed-out background work contaminating the next case |

Deleted the stale-data test file that asserted timestamps returned by its own
`execute_query` mock. Its existing wallet mapping tests remain, and the new
PostgreSQL query test verifies the snapshot behavior the deleted suite claimed.
Deleted the fake-DB Supabase deduplication "integration" suite: it could not prove
SQL deduplication or definer privileges. The dedicated SupabaseFetcher suite
already tests actual TypeScript deduplication with duplicate mixed-case wallets,
policy projection, and exact usage-ledger SQL/payloads. This deletion is not a
claim of real SQL/role integration coverage. A repository-wide caller search
also found that its synthetic count-query handler in the development mock pool
had no remaining caller; that obsolete handler was removed with the suite.

## Workstream disposition

| Workstream                   | Present and checked                                                                                                                                               | Still required before claiming exhaustive closure                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| WS1 safety and funds         | Existing boot/simulation/ownership gates; added real signature, immutable review, exact RPC/filter, abort, concurrency and expiry checks                          | A complete gate-to-test-to-mutation matrix for every historical WS1 item; this pass's 23 mutations do not represent every gate in the repository |
| WS2 CI and environment       | Both DB CI jobs set RUN_INTEGRATION; Turbo includes that mode in test cache keys; PostgreSQL integration runs; deterministic snapshot/timezone/retry/daemon tests | Disposition of every remaining historical real-time or unnecessary-DB finding                                                                    |
| WS3 incorrect expectations   | Existing debt key, beta ddof, recovery gain, Sortino, malformed JSON, singular week, Fish Audio cap and response-read fixes; additional production fixes above    | No missing concrete production correction identified in the supplied list; static review is not proof that every financial formula is correct    |
| WS4 real objects             | Existing processor/URL-parser/signature corrections; additional real borrowing service, real Privy signatures and removal of fake integration claims              | Check remaining raw over-mocking findings individually                                                                                           |
| WS5 stronger assertions      | Concrete assertions in the table above                                                                                                                            | Remaining per-file weak-assertion findings, particularly status-only UI/endpoint and other writer suites                                         |
| WS6 consolidation            | Existing API/PipelineQueuesBoard/statement-rule consolidations; removed obsolete suites and stale line-number annotations in touched alpha-etl files              | Remaining sweep merges and shared harness/fixture extraction; filename alone is insufficient reason to remove a test                             |
| WS7 migrations and dead code | Existing dead module deletion, executable-token/comment-stripping checks and frozen-snapshot labeling; new executed wallet SQL                                    | Root migration/role execution coverage remains distinct from frozen app-local parity; text tests cannot prove live privileges or lease behavior  |

## Executed validation

Final source verification passes. The first coverage run exposed an obsolete
nonce fallback, and the first aggregate run exposed daemon timeout/contamination;
the subsequent failed iterations are superseded by the final passing results
below. Gates and exclusions were not weakened.

- `pnpm verify changed`: **52/52 tasks passed** across all nine affected workspaces,
  including lint, type-check, tests, Playwright, deadcode, duplication and required
  dependency builds. Result: `.ai-verify/result.json`; log:
  `.ai-verify/logs/verify-changed.log`.
- `pnpm turbo run test:coverage --concurrency=2` with the eight directly modified
  workspace filters: **14/14 tasks passed**. Every configured coverage metric is
  100%; Python reports its configured line coverage. The last run reuses valid
  caches for unchanged workspaces and reruns the final Python source.
- Playwright: **15 passed**. Analytics schema-bootstrap checks and the fast
  strategy-snapshot check also ran through the aggregate test command.
- All changed TypeScript files were formatted with Prettier and applicable ESLint
  fixes; changed Python files pass Ruff. `git diff --check` passes.

| Workspace                              | Full test count reported by aggregate | Coverage gate                 |
| -------------------------------------- | ------------------------------------: | ----------------------------- |
| account-engine                         |                                 1,073 | 100%                          |
| alpha-etl                              |                                 1,403 | 100%                          |
| analytics-engine                       |                                 2,780 | 100% configured line coverage |
| app                                    |                                 1,385 | 100%                          |
| app-core                               |                                 1,013 | 100%                          |
| control-center                         |                                 1,921 | 100%                          |
| intent-engine                          |                                   305 | 100%                          |
| podcast-pipeline                       |                                 3,551 | 100%                          |
| desktop (affected dependency consumer) |                                    80 | Outside this coverage run     |

The historical audit and the still-unreviewed findings in the disposition table
are not automatically closed by these passing gates.

The current mutation checks deliberately change production, require an assertion
failure, and restore the original working-tree contents in a finally block.
Twenty-three mutations were killed: calendar month grouping, free-plan RPC, token
filter, retry exponent/cap, both bridge abort boundaries, request and preview
copies, signature gate, HTTP server retry, concurrent HLP submission, Rednote
prefix/new-topic filters, stale ingest cleanup, confirmation expiry, single preview consumption, wallet
submission concurrency, failed-submission lock cleanup, immediate caller
cancellation, pre-aborted request rejection, pre-aborted signal composition,
and risk-only re-simulation changes.

Mutation source/test selectors and outcomes are preserved in
[test-quality-mutation-evidence.json](./test-quality-mutation-evidence.json).

Tests use a disposable local PostgreSQL container with a tmpfs data directory;
no production database is used. Dependencies were installed from the existing
lockfiles. Final commands, counts and gate results above follow the
last source changes; coverage is evidence of execution, not a substitute for
assertion quality or completion of the remaining review list.

## Current product contracts

- Account-engine plan orchestration treats provider unavailability as advisory;
  explicit failed simulations remain blocked. A historical audit is not grounds
  to restore a retired availability policy.
- Snapshot deduplication uses the canonical snapshot date and ingestion ordering;
  an obsolete time_at contract is not restored.
- Frozen podcast app-local schema/grants tests prove historical parity only.
  Effective root migration privileges and lease behavior require executed
  root-schema tests rather than treating those snapshot tests as live coverage.
