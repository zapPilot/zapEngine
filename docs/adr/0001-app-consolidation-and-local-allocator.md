# ADR 0001: Universal-app consolidation, frontend/desktop disposition, and the local-allocator roadmap

## Status

Accepted — 2026-07-06

## Context

The multi-client era (web `apps/frontend`, Flutter mobile, Tauri desktop) ended with
phases 4D–5H: everything converged on **`apps/app`** (Expo universal, iOS/Android/Web)
plus **`apps/desktop`** (Electron shell over the app web export). Three questions
remained open, against this product north star:

> One universal app = a **portfolio account**: see all assets by allocation %
> (portfolio-centric, not wallet-centric), listen to podcasts in-app, 100%
> open-source and locally runnable allocator, one-click allocation into a chain
> (incl. cross-chain), every transaction human-reviewed short-term, and long-term a
> background allocator on the user's own machine that monitors drift and
> auto-rebalances.

1. Can `apps/frontend` be deleted?
2. Can `apps/desktop` be deleted?
3. What should change in the overall architecture and per-app responsibility split?

Verified state at decision time:

- `apps/frontend` is a 2-file Vercel shim (its `build` proxies to
  `@zapengine/app build:web`). It was fully deleted in phase 4D (`a686fe7f`) and
  had to be restored (`8458a5e6`) because a Vercel project's Root Directory points
  at it; two shim-drift fixes followed. [apps/app/vercel.json](../../apps/app/vercel.json)
  already exists with equivalent config. No CI/turbo/lint-staged/script references remain.
- `apps/desktop` is not a thin shell: 814 LOC main-process + 769 LOC tests. It owns
  the repo's only background rebalance scheduler
  ([rebalanceScheduler.ts](../../apps/desktop/src/main/scheduler/rebalanceScheduler.ts) +
  [suggestionDriftReader.ts](../../apps/desktop/src/main/scheduler/suggestionDriftReader.ts)):
  polls the analytics daily suggestion every 6h, notifies at drift ≥ 1%, deep-links
  into the app's confirm flow, and never signs (guardrail).
- The execution rail is mostly built:
  [executeDepositPlan.ts](../../packages/app-core/src/lib/wallet/executeDepositPlan.ts)
  (EIP-7702 batch with injectable `executeAtomicBatch`), account-engine
  [wallet-execution.ts](../../apps/account-engine/src/routes/wallet-execution.ts)
  (`POST /wallet-execution/privy/{prepare,confirm}-send-calls` — the server verifies
  the user's typed-data authorization and relays; it never decides), Tenderly
  simulation returned at prepare time, and
  [deposit.ts](../../packages/types/src/api/deposit.ts) already gated to
  Base-only USDC/native ETH. The gap is the last mile: a native (RN-safe) Privy
  wallet backend and the stubbed
  [InvestConfirmScreen.tsx](../../apps/app/src/screens/invest/InvestConfirmScreen.tsx).
- [route.ts](../../apps/account-engine/src/modules/plan-orchestration/route.ts)
  serves only `POST /plan-orchestration/{deposit,withdraw}`; the previously
  documented `rebalance` route does not exist yet (docs corrected alongside this ADR).
- analytics-engine requires the Supabase production read-only replica fed by
  alpha-etl (paid sources: DeBank, CMC). It cannot — and does not need to — run on
  user machines.

## Decision D1 — Delete `apps/frontend`, flip-first

Delete the shim, in this exact order:

1. **(Human, Vercel dashboard)** Project → Settings → Build and Deployment →
   Root Directory: `apps/frontend` → `apps/app`. Keep "Include files outside the
   root directory" enabled (the build cds to repo root for turbo); framework stays
   "Other".
2. **(Human)** Redeploy the latest production commit without build cache.
3. Verify: production URL loads; a deep route hard-reload works (SPA rewrite); one
   trivial PR confirms preview deploys still build. Soak 24–48h — rollback during
   the soak is a one-click dashboard revert, which stays possible only while the
   shim exists on `main`.
4. Repo cleanup PR (after soak): delete `apps/frontend/`; drop the
   `apps/frontend` lines from `.dockerignore`; reword the stale "frontend sharded
   coverage" comment in `.github/workflows/ci.yml`; delete
   `.todos/test-hygiene-apps-frontend.json`; remove the stale `apps/frontend`
   entry from `coverage/summary.json`; run `pnpm install` to drop the workspace
   importer from the lockfile.

Rejected alternatives: keeping the shim indefinitely (it has already produced two
drift-fix commits and misleads every reader about where the web app lives), and
deleting repo-first (every production and preview deploy fails until the dashboard
is fixed — this exact failure already happened once in phase 4D).

## Decision D2 — Keep `apps/desktop`

The desktop shell is the seed and only credible host of the product's third pillar:
local background monitoring → notify → human-review handoff. Its maintenance cost is
small (no product UI, three prod deps, strong test coverage). Do **not** add a
DMG/packaging CI job now — packaging is manual and distribution is not the
bottleneck; money movement is.

One hygiene rule: [ipc.ts](../../apps/desktop/src/shared/ipc.ts) and
[desktopBridge.web.ts](../../apps/app/src/integration/desktopBridge.web.ts) form one
contract — change them in the same PR.

## Decision D3 — Near-term roadmap (0–3 months): close the manual loop first

Priority is the last mile of the Execution plane, not new planes.

| Milestone | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Key touchpoints                                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**    | D1 flip + repo cleanup; doc-drift fix (route claims `{deposit,withdraw}` until rebalance ships)                                                                                                                                                                                                                                                                                                                                                                                                                        | root `CLAUDE.md`, module `CLAUDE.md`                                                                                                                                                                                |
| **M1**    | Native Privy wallet backend — RN-safe twin of [usePrivyWalletBackend.ts](../../packages/app-core/src/hooks/wallet/usePrivyWalletBackend.ts) for `@privy-io/expo`, sharing the prepare→confirm transport. Timeboxed spike: typed-data signing support + gas sponsorship on Base. If native snags, ship M2 web-first                                                                                                                                                                                                     | `packages/app-core/src/hooks/wallet/`, `apps/app/src/providers/`                                                                                                                                                    |
| **M2**    | First real money movement: deposit, **Base + Morpho** (already the only thing the contract permits). Flow: plan preview → "Sign and invest" → `prepare-send-calls` returns the Tenderly review → **render the review as the human-review gate** → confirm → broadcast. Plan = quote; prepare = pre-sign simulation gate — two distinct user moments                                                                                                                                                                    | [InvestConfirmScreen.tsx](../../apps/app/src/screens/invest/InvestConfirmScreen.tsx), [useDepositExecutionState.ts](../../packages/app-core/src/hooks/useDepositExecutionState.ts), new simulation-review component |
| **M3**    | Rebalance loop, strictly after M2 (reuses the whole rail): new `packages/types` rebalance contract (thin request `{userAddress, strategyId}`; plan-orchestration pulls suggestion + holdings server-side — the client never recomputes drift) → `POST /plan-orchestration/rebalance` composing via [rotate.builder.ts](../../packages/intent-engine/src/builders/rotate.builder.ts) → app `/rebalance` review screen → desktop deep-link target moves from `/invest` to `/rebalance` → restore `rebalance` in the docs | `packages/types/src/api/`, plan-orchestration module, `apps/app/src/app/`, [desktopBridge.web.ts](../../apps/app/src/integration/desktopBridge.web.ts)                                                              |
| **M4**    | Withdraw UI on the same rail; activity history; client-side allowlist assertions from the intent-engine registry                                                                                                                                                                                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                   |

Ordering rationale: rebalance is the more complex flow; proving the signing rail on
the narrowest flow (single-chain deposit) first de-risks everything after it.

## Decision D4 — Target architecture (6–24 months): two trust planes

"100% open-source, locally runnable" does **not** mean every service runs on a
laptop. It means all code is open (already MIT) and the **action plane** — the loop
that observes drift, composes, simulates, signs, submits — can run entirely on the
user's machine with only public RPCs and _optional_ advice feeds as external
dependencies.

- **Advice plane** (may stay hosted, untrusted by design): alpha-etl → Supabase
  replica → analytics-engine. Output is a suggestion, never an authority. A lying
  advice plane cannot move money outside user-signed policy.
- **Action plane** (must be local-runnable at L3+): drift math (on-chain positions
  via the intent-engine vault registry + viem, not DeBank), plan composition,
  policy enforcement, simulation gate, signing.

Structural moves (each independently shippable, in order):

1. Close the manual loop (= D3 M1–M3).
2. Extract **`packages/plan-composer`**: pure composition/drift/plan-hash logic
   moves out of the account-engine module; the module becomes a thin hosted HTTP
   host. Package extraction, **not** a service — the `apps/plan-orchestration`
   service extraction keeps its original triggers
   ([plan-orchestration-evolution.md](../../apps/account-engine/docs/plan-orchestration-evolution.md))
   and is not accelerated by local-first.
3. Plan-integrity primitives in `@zapengine/types`: plan hash, expiry/TTL,
   idempotency key; simulation mandatory for rebalance plans.
4. Ship **L2 one-tap review** (see ladder below).
5. Extract **`packages/allocator-daemon`**: the polling loop leaves
   [rebalanceScheduler.ts](../../apps/desktop/src/main/scheduler/rebalanceScheduler.ts)
   (which becomes a thin adapter); a CLI bin (`zap-allocator`, notify-only at
   first) makes "locally runnable" a checkable claim. Not Electron-main (untestable
   loop, no server/RPi reuse), not app-core (ships to mobile; mobile can never
   background-execute — its role is review, policy editing, receipts, kill switch).
6. Local advice independence: on-chain positions adapter + configurable price
   source; analytics becomes an optional advice adapter with a local drift fallback.
7. Policy engine + journal + kill switch + shadow mode (full L3 loop minus signing).
8. Enable **L3**: EIP-7702 session delegation
   ([eip7702.executor.ts](../../packages/intent-engine/src/execution/eip7702.executor.ts)),
   session key in the OS keychain, per-user execution-mode flag. This is the step
   where "desktop never signs" is deliberately retired — by the daemon, under
   policy, not by Electron.

### Automation ladder

| Level                          | Behavior                                                                  | Security prerequisites (cumulative)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0 Manual                      | User builds deposit/withdraw, reviews, signs                              | M2 confirm flow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L1 Notify _(exists)_           | 6h drift poll → notification → deep link                                  | "desktop never signs" guardrail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L2 One-tap review              | Notification carries a fully built, **pre-simulated** plan; one signature | `POST /plan-orchestration/rebalance`; plan hash + idempotency (signed plan byte-identical to submitted plan); mandatory simulation before notify; plan expiry (LiFi quotes go stale)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| L3 Policy-bounded auto-execute | Daemon signs unattended, strictly inside a user-signed policy             | **All of:** local signer (7702 session key in OS keychain, or local keystore; Privy is explicitly _not_ the L3 primary — unattended signing must not depend on a hosted SaaS); deny-by-default policy engine (chain/protocol/vault allowlists, max % per rebalance, drift threshold, cooldown, notional caps, slippage cap, gas cap, time-locked policy changes); simulation gate **fail-closed** (Tenderly primary via [simulation.adapter.ts](../../packages/intent-engine/src/adapters/simulation.adapter.ts), local `eth_call` fallback; no sim → no sign); kill switch (local toggle + on-chain session revocation + one-tap revoke from mobile); append-only journal + push receipt per auto-execution; mandatory shadow-mode soak before enablement; execution-mode flag flipped to `local` |
| L4 Full auto                   | Advice may adjust target weights within user-set meta-bounds              | Signed/versioned advice feed; policy never self-amending; anomaly halts; external audit of the policy engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Authority model

"One authoritative path per money-moving flow" evolves to **per-user-per-mode
authority**: account-engine (identity plane) owns an execution-mode flag
(`hosted | local`). Activating the local daemon at L3 flips it; the hosted path then
refuses automated flows for that user. Never both simultaneously. Plan hash +
idempotency + nonces make double-execution structurally awkward even if the flag
desyncs; a plan-format version check makes stale daemons fail closed.

## Responsibility allocation (near-term end state)

| Component              | Owns                                                                                                                                                                                                           | Must never                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| apps/app               | Universal UI (portfolio %, invest/withdraw/rebalance review, podcast playback); plan preview via plan-orchestration; human review (simulation panel) + sign/broadcast via Privy backends; deep-link/IPC target | Compute plans or drift locally                                                                          |
| apps/desktop           | Local background monitoring (6h drift poll, notification, deep-link handoff); tray/protocol plumbing                                                                                                           | Sign, broadcast, or hold product UI/business logic                                                      |
| account-engine         | Identity/persistence; the bounded plan-orchestration module; the Privy wallet-execution relay + prepare-time simulation                                                                                        | Plan money movement outside the bounded module; execute without a verified user authorization signature |
| analytics-engine       | Strategy brain: configs, daily suggestion, backtests, portfolio analytics (read-only replica)                                                                                                                  | Build transactions; write to the DB                                                                     |
| packages/intent-engine | Pure library: intent → `PreparedTransaction[]`, LiFi, simulation adapter, 7702 helpers; usable server-side and client-side                                                                                     | Own I/O; know about identity or analytics                                                               |
| podcast-pipeline       | Article → multilingual episodes; `GET /episodes` feed                                                                                                                                                          | Anything portfolio-related                                                                              |

## Non-goals (explicitly not building)

- Local analytics-engine mode (FastAPI + replica + paid ETL on laptops) — local
  mode needs drift arithmetic, not the brain.
- A hosted auto-execution service signing server-side — that is a custody business
  with a different risk class; the local daemon is the product.
- Mobile background execution workarounds (iOS BGTaskScheduler etc.).
- Safe / full ERC-4337 migration — 7702 session scoping on existing EOAs covers L3.
- Strategy scripting/plugins in the daemon — policy is declarative config, never
  user code.
- Preemptive `apps/plan-orchestration` service extraction — package first; service
  only on the documented triggers.

## Consequences

- Easier: one UI codebase; the web deploy story stops lying (`apps/app` is the
  Vercel root); the rebalance loop has a single, reviewable rail; "locally
  runnable" becomes an incremental engineering claim (CLI daemon) instead of a
  slogan.
- Harder: app-core must keep its RN-safe/web-only discipline (two wallet backends);
  desktop IPC and app deep-link routes form a cross-app contract; L3 demands
  security work (policy engine, shadow mode, audit) before any unattended signing.
- Revisit: the `apps/plan-orchestration` extraction triggers; DMG signing/
  notarization when desktop distribution becomes a goal; L4 only after L3
  telemetry and an external audit.

## Action items

- [ ] (Human) Vercel Root Directory flip + redeploy + 24–48h soak (D1 steps 1–3)
- [ ] Repo cleanup PR deleting `apps/frontend` (D1 step 4)
- [x] Doc-drift fix: route claims match code (`{deposit,withdraw}`) — done with this ADR
- [ ] M1 native Privy wallet backend (+ spike findings recorded)
- [ ] M2 first real Base+Morpho deposit behind an env flag
- [ ] M3 rebalance contract → endpoint → screen → desktop handoff
- [ ] plan-composer extraction (D4 step 2) after M3 stabilizes
