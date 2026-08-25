See @../AGENTS.md for shared package guidelines.

# App-core guardrails

`app-core` is shared by the React Native/web app and Electron desktop host. Default modules must stay host-neutral; web-only exceptions are explicitly enforced by `eslint.config.mjs` through `WEB_ONLY_FILES`.

## Platform boundary

- RN-safe code must not use DOM globals, `import.meta`, or web-only libraries. Do not widen the lint exemptions to make an import pass.
- Put genuinely web-only modules on the existing `WEB_ONLY_FILES` list and expose an RN-safe interface/alternative where shared callers need the behavior.
- Type-only imports from web-specific modules are allowed when erased at compile time.
- Consumers also enforce the boundary; keep app-core and app lint restrictions aligned.

## Runtime env

- Read env lazily through `getRuntimeEnv`; never capture host env at module import time.
- Hosts inject values with `configureAppCoreEnv` during bootstrap.
- Shared app-core env keys keep the `VITE_` contract; native hosts map their public env names into that contract.
- Human-facing client config uses canonical unprefixed names. The root projector creates bundler-specific names before startup; Expo and desktop adapters then inject app-core's existing `VITE_*` contract.

## Async execution authority

- Execution hooks use latest-run/reset authority. After every awaited external boundary, verify the current run/abort token before downstream calls or state publication.
- A superseded/reset run must never restore stale status, hashes, plans, quotes, tiers, or errors.
- Concurrency regressions need tests that pause an awaited boundary, supersede/reset the run, then resolve/reject it and prove only the newest run can publish.

## Reviewed batch execution

- Treat a reviewed batch as an immutable execution snapshot. Submission must execute that exact reviewed plan/transactions, not refresh or replan inside the submit handler.
- Expiry, wallet, batch, simulation, and risk fingerprints are freshness guards; stale review blocks execution and requires a new review.
- Switch to the reviewed batch `chainId` before resolving the wallet client or sending calls. The wallet's currently selected chain is not authoritative.
- Preserve the existing reviewed-submission idempotency/double-submit guards in `src/lib/wallet/reviewedBatchExecution.ts`.
