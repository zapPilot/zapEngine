# ADR 0002: Seven-plane trust map, centralization boundaries, and progressive decentralization

## Status

Accepted — 2026-07-07

Supplements [ADR 0001](./0001-app-consolidation-and-local-allocator.md); does
not supersede it. 0001 owns the M1–M4 roadmap, the L0–L4 automation ladder, the
advice/action trust planes, and the per-user-per-mode authority model; this ADR
pins the trust boundaries all of that builds toward.

## Context

ADR 0001 settled app topology and the execution roadmap. It did not settle
three things: which layers of the system are allowed to stay centralized, which
must never be, and where the strategy plane's source of truth lives. This ADR
fixes those boundaries, against this trust north star:

> **"My backend gets fully hacked — your money still can't move."** The set of
> addresses user funds can reach is locked on-chain, outside the blast radius
> of any server compromise. Corollary: the strategy's decisions are anchored in
> a publicly verifiable, append-only log, so the track record is a checkable
> claim, not a marketing slide.

Already decided in 0001 and **not restated here**: the advice/action plane
split (D4), the L0–L4 automation ladder with its L3 prerequisites (fail-closed
simulation, local policy engine, kill switch, journal, shadow mode), the M1–M4
execution roadmap, and the hosted-vs-local authority model. Three questions
remained open:

1. How does a **never-centralized** on-chain invariant coexist with 0001's
   _local_ declarative policy engine and its "no Safe/4337 migration" non-goal?
2. How do Privy-hosted embedded wallets coexist with "private keys are never
   centralized"?
3. Where does an event-sourced signal → decision → plan → execution log live,
   given analytics-engine's database connection is read-only by rule?

Verified state at decision time (the systematic per-plane inventory is in the
gap map below; listed here are only the facts that force the three questions):

- There are **zero Solidity contracts in the repo**. Every allowlist is
  off-chain: the vault registry
  ([vaults.ts](../../packages/intent-engine/src/registry/vaults.ts), Base-only
  Morpho Moonwell USDC + Seamless WETH) and the known-delegate map
  ([eip7702Delegation.ts](../../packages/app-core/src/lib/wallet/eip7702Delegation.ts),
  Ambire/OKX supported, MetaMask unsupported) are TypeScript data, enforceable
  only by servers and clients we operate.
- Wallet binding is a plain insert into `user_crypto_wallets`
  ([users.service.ts](../../apps/account-engine/src/users/users.service.ts)) —
  no challenge-signature ownership proof. Signature verification exists only at
  execution time (typed-data check in
  [privy-wallet-execution.service.ts](../../apps/account-engine/src/services/privy-wallet-execution.service.ts)).
- Simulation is asymmetric. The real Tenderly integration
  ([tenderly-simulation.service.ts](../../apps/account-engine/src/services/tenderly-simulation.service.ts))
  runs only on the Privy prepare/confirm relay. The intent-engine defaults to a
  `NoopSimulationAdapter` and its own Tenderly adapter is a stubbed POC
  ([simulation.adapter.ts](../../packages/intent-engine/src/adapters/simulation.adapter.ts));
  plan-orchestration never simulates.
  [InvestConfirmScreen.tsx](../../apps/app/src/screens/invest/InvestConfirmScreen.tsx)
  surfaces amount/gas/time/tx-count but no asset diff; LiFi's `toAmountMin` is
  never validated by our code; approval amounts are whatever the caller passes
  (`buildApproveTx` encodes the amount unchecked — no cap policy).
- The "verifiable track record" is **partially built already**:
  [scripts/track-record/](../../scripts/track-record/generate-daily-snapshot.ts)
  generates a daily NAV/positions/costs/transactions snapshot, EIP-191-signs
  it, pins it to IPFS, and chains it by `previousCid`, with an independent
  [verifier](../../scripts/track-record/verify-track-record.ts). What it does
  **not** capture is the signal → decision chain that produced the positions.
- There is no transaction ledger or event store anywhere; portfolio state is
  snapshot-based (alpha-etl `alpha_raw` tables, append-only by `inserted_at`).
  Cost basis is unimplemented. Execution leg state
  ([useDepositExecutionState.ts](../../packages/app-core/src/hooks/useDepositExecutionState.ts))
  is in-memory and client-only, and there is no sequential fallback when atomic
  batching is unsupported.

## Decision D1 — Seven trust planes; plan-orchestration stays the composing layer

The system is described by seven planes, each with an owner and a "must never":

| #   | Plane             | Owner today                                                                                                                                                                                                                                               | Must never                                                                                          |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Identity          | account-engine (Privy JWT/passkey auth, Telegram, `user_crypto_wallets` 1:N)                                                                                                                                                                              | Build transactions (the bounded plan-orchestration module is the one exception, per root CLAUDE.md) |
| 2   | Wallet            | User EOAs + EIP-7702 delegates; [capability.detector.ts](../../packages/intent-engine/src/execution/capability.detector.ts), [eip7702Delegation.ts](../../packages/app-core/src/lib/wallet/eip7702Delegation.ts)                                          | Carry an unbounded delegate — the delegate is the on-chain policy anchor (D3)                       |
| 3   | Strategy          | analytics-engine ([regime_tracking_service.py](../../apps/analytics-engine/src/services/market/regime_tracking_service.py), `GET /v3/strategy/suggestion`)                                                                                                | Build transactions; write to the DB                                                                 |
| 4   | Intent            | [packages/intent-engine](../../packages/intent-engine) — pure; deps are types/viem/zod/LiFi, all I/O injected                                                                                                                                             | Own I/O; know identity or analytics                                                                 |
| 5   | Simulation / Risk | Split today: [tenderly-simulation.service.ts](../../apps/account-engine/src/services/tenderly-simulation.service.ts) on the Privy rail; [simulation.adapter.ts](../../packages/intent-engine/src/adapters/simulation.adapter.ts) elsewhere (Noop default) | Be bypassable on a money-moving path (target state; not true today — see gap map)                   |
| 6   | Execution         | Clients sign ([executeDepositPlan.ts](../../packages/app-core/src/lib/wallet/executeDepositPlan.ts)); the account-engine relay verifies-and-relays ([wallet-execution.ts](../../apps/account-engine/src/routes/wallet-execution.ts))                      | Let a server sign or decide                                                                         |
| 7   | Data / Indexing   | alpha-etl ingestion + analytics snapshots; the future ledger (D5)                                                                                                                                                                                         | Overrule the event log once D5 lands — snapshots become projections                                 |

Three vocabularies, one mapping — this table replaces neither existing view:

- Root `CLAUDE.md`'s **four planes + composing layer** stays the
  _dependency-rule_ view used for day-to-day code placement. The seven planes
  are the _trust_ view: Wallet was implicit in "Execution … + wallet",
  Simulation/Risk was a feature of the execution rail, Data/Indexing was
  invisible. Nothing moves between apps or packages because of this ADR.
- Against 0001-D4's advice/action cut: Strategy and Data/Indexing are the
  advice plane; Wallet, Intent, Simulation/Risk, and Execution are the action
  plane; Identity straddles (owns the execution-mode flag, plans no money
  movement).
- **plan-orchestration is deliberately not an eighth plane.** It remains the
  bounded composing layer (strategy → intent → plan) inside account-engine, per
  root CLAUDE.md and
  [plan-orchestration-evolution.md](../../apps/account-engine/docs/plan-orchestration-evolution.md).

Simulation/Risk is hereby promoted to a first-class plane. It is the thinnest
plane today; the gap map quantifies exactly how thin.

## Decision D2 — Centralization boundary taxonomy: Now / Later / Never

The never-centralized invariants, numbered so later decisions can cite them:

- **N1 — Private keys.** No key material that can move user funds is held by
  our servers as the terminal state (custody tiers in D4).
- **N2 — Fund discretion.** No server-side decision can move funds without a
  user-signed authorization. (Already enforced on the Privy rail: the relay
  verifies typed-data and never decides — 0001.)
- **N3 — Fund routing.** The set of addresses user funds can reach is locked
  **on-chain** in the delegate policy: target-contract whitelist,
  per-transaction cap, user-revocable at any time. A fully compromised backend
  — hacked, coerced, or malicious — can at worst refuse service or propose bad
  plans that simulation and review catch; it cannot exfiltrate.

**Centralized now** — acceptable because, with N1–N3 held, none of it has fund
authority; a lying or captured instance can annoy, not steal (this generalizes
0001-D4's "a lying advice plane cannot move money" test to every plane):

| Capability         | Where                               | Why centralization is acceptable                                                                 |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Strategy compute   | analytics-engine                    | Suggestion, never authority; deterministic + versioned (D5) so it is auditable after the fact    |
| Data indexing      | alpha-etl → Supabase replica        | Read side only; wrong data → wrong advice, still bounded by N2/N3                                |
| Plan orchestration | account-engine module               | Output is an unsigned plan; the user (or policy, at L3) signs, and the simulation plane gates it |
| Notifications      | account-engine / Telegram / desktop | Worst case is noise or silence                                                                   |

**Decentralized later** — commitments with triggers, not aspirations:

| Item                       | What                                                                                     | Trigger to start                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| (a) Decision-log anchoring | Extend the shipped track-record CID chain to cover signal → decision events (D5 phase 2) | D5 phase 1 (internal event tables) done                                                         |
| (b) Execution relay        | Alternative submission paths so our relay is never a liveness choke point                | A second execution rail exists (0001-M3 rebalance shipped) and users ask for relay independence |
| (c) Intent solving         | Open solver market fills normalized intents                                              | Intent volume makes competitive solving economically meaningful; not before                     |

**Never centralized:** N1–N3. These are product commitments, not preferences;
D3 and D4 define the mechanisms and the enforcement points.

## Decision D3 — On-chain policy floor: state the invariant now, stage the mechanism

Resolves Context question 1. There are **two policy layers, not one**:

- 0001's L3 **local declarative policy engine** stands unchanged as the _rich_
  layer: drift thresholds, cooldowns, notional/slippage/gas caps, time-locked
  changes. Expressive and cheap to evolve — but mutable by whoever controls the
  host.
- Beneath it this ADR adds a deliberately **thin on-chain floor**: per-EOA
  target-contract whitelist + per-transaction cap + revocation, enforced by the
  7702 delegate. Coarse on purpose — the expressive logic stays local so policy
  iteration never needs a contract audit; the floor guarantees N3 even when the
  rich layer is compromised.

0001's non-goal is reaffirmed: no Safe / ERC-4337 migration — every stage below
is 7702-native on existing EOAs.

Staged mechanism:

- **Stage A (now → L2):** what exists — whitelisted third-party delegates
  (Ambire/OKX via
  [eip7702Delegation.ts](../../packages/app-core/src/lib/wallet/eip7702Delegation.ts)),
  the off-chain [vault registry](../../packages/intent-engine/src/registry/vaults.ts),
  and client-side allowlist assertions (0001-M4). Honest status: **N3 is not
  met at Stage A**; the compensating controls are human review of every
  transaction (L0–L2) plus the simulation gate.
- **Stage B (prerequisite for L3):** timeboxed spike — can Ambire/OKX 7702
  session scoping express whitelist + per-tx cap + revoke? If yes, session keys
  on audited third-party delegates are the mechanism; record findings the way
  0001-M1 records its spike.
- **Stage C (only if B falls short, and before L4):** a minimal custom delegate
  contract — the repo's first `.sol` and a new competence (toolchain, external
  audit budget). Scope stays exactly N3: whitelist, cap, revoke; nothing else.

**The binding rule** (this is the decision): **L3 unattended signing does not
enable until N3 is enforced on-chain.** This adds one row to 0001's L3
prerequisite list; the ladder itself is unchanged.

Rejected alternatives: building the custom contract first (audit cost before
product-market fit, and no Solidity toolchain exists today); trusting the local
policy engine alone (a compromised host edits local config — violates N3 by
construction).

## Decision D4 — Custody tiers: hosted keys are a ramp, never the terminal state

Resolves Context question 2. Two custody tiers:

- **Tier H (hosted):** Privy embedded wallets — passkey onboarding, gas
  sponsorship, low-friction UX. Honest statement: **Tier H does not satisfy
  N1.** Privy's infrastructure holds key shares that could sign anything,
  including delegate changes. No wording changes that.
- **Tier S (self-custody):** user-held EOA + 7702 delegate; at L3, a session
  key in the OS keychain or a local keystore (0001's L3 row).

The reconciliation rule: **N1 binds absolutely on the automation path.**
Anything above L2 requires Tier S; Tier H is permitted only at L0–L2, where a
human reviews and signs every transaction. This upgrades 0001's "Privy is
explicitly not the L3 primary" from an implementation note to a product
commitment.

Graduation is a product requirement: every Tier H user must have a visible
route to Tier S. The identity plane's 1:N wallet binding already supports it
structurally; the missing piece is the challenge-signature ownership proof at
binding time (action item 1) — without it, linking a self-custody EOA to an
account is an unverified claim.

## Decision D5 — Event-sourced strategy plane; the ledger lives in account-engine, anchored via the track-record chain

Resolves Context question 3. The invariant: **signal → decision → plan →
execution is an append-only event chain; the event log is the source of truth;
snapshots (portfolio, positions, NAV) are projections.**

Placement follows a compute/persist split, which is how the read-only rule
stays intact:

- **analytics-engine computes and stays read-only.** It emits regime state and
  the daily suggestion; it persists nothing.
- **The caller persists.** plan-orchestration already pulls the suggestion
  server-side (0001-M3 design) and the prepare/confirm relay already lives in
  account-engine — so **account-engine, the repo's designated persistence
  owner, hosts the append-only event tables** (signal, decision, plan, and
  execution events; insert-only, mirroring alpha-etl's
  append-only-by-`inserted_at` discipline, enforced with insert-only grants).
  Every decision event carries `strategyVersion` + config identity — closing
  the implicit-versioning gap (today "v1" appears only in
  [track-record-meta.json](../../apps/landing-page/public/track-record-meta.json)
  while configs are frozen dataclasses in
  [strategy_presets.py](../../apps/analytics-engine/src/config/strategy_presets.py)).
- **Public anchoring extends the shipped pipeline instead of building a second
  one:** a daily decision-log digest folds into (or chains beside) the
  track-record CID chain in
  [scripts/track-record/](../../scripts/track-record/publish-daily-snapshot.ts).
  Ordering: internal event tables first (cheap, unblocks everything), anchoring
  second. This turns D2's "decentralize later (a)" into an incremental change
  on code that already exists.

Unification — one ledger, four consumers, so two journals never get built:

- It **is** the append-only journal 0001's L3 row requires.
- Execution-leg events are the persistence that makes
  [useDepositExecutionState.ts](../../packages/app-core/src/hooks/useDepositExecutionState.ts)
  resumable across sessions.
- Cost basis becomes a projection over the ledger (it is unimplemented today —
  building it any other way would create a second source of truth).
- It is the Data plane's missing transaction ledger / activity history.

## Per-plane gap map (current → target)

| Plane               | Current (verified)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Target                                                                                                                                             | Closed by                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Identity            | 1:N binding ([users.service.ts](../../apps/account-engine/src/users/users.service.ts)) but wallet bind is a plain insert — no ownership proof; Privy JWT + typed-data verification at execution; Telegram live                                                                                                                                                                                                                                                                                                         | Challenge-signature ownership proof at binding; execution-mode flag                                                                                | Action 1; 0001-D4           |
| Wallet              | Delegate inspection ([eip7702Delegation.ts](../../packages/app-core/src/lib/wallet/eip7702Delegation.ts)) + capability detection ([capability.detector.ts](../../packages/intent-engine/src/execution/capability.detector.ts)); zero `.sol`; off-chain [VAULT_REGISTRY](../../packages/intent-engine/src/registry/vaults.ts); no per-tx cap, no revoke flow                                                                                                                                                            | On-chain whitelist + per-tx cap + revoke (N3)                                                                                                      | D3 Stages A→C               |
| Strategy            | Regime engine ([regime_tracking_service.py](../../apps/analytics-engine/src/services/market/regime_tracking_service.py)); frozen configs + Optuna metadata but implicit versioning; 500-day backtest snapshot fixture as the determinism gate; `GET /v3/strategy/suggestion`                                                                                                                                                                                                                                           | Explicit `strategyVersion` on every decision event                                                                                                 | D5                          |
| Intent              | Pure library — matches its claim (deps: `@lifi/sdk`, `@zapengine/types`, `viem`, `zod`; I/O injected)                                                                                                                                                                                                                                                                                                                                                                                                                  | Unchanged; expose `toAmountMin` to the Simulation plane for server-side validation                                                                 | Action 5                    |
| Simulation / Risk   | Real Tenderly only on the Privy prepare/confirm rail ([tenderly-simulation.service.ts](../../apps/account-engine/src/services/tenderly-simulation.service.ts)); intent-engine defaults to Noop with a stubbed Tenderly POC ([simulation.adapter.ts](../../packages/intent-engine/src/adapters/simulation.adapter.ts)); plan-orchestration never simulates; no asset diff in [InvestConfirmScreen.tsx](../../apps/app/src/screens/invest/InvestConfirmScreen.tsx); `toAmountMin` unvalidated; approval amounts uncapped | Mandatory fail-closed simulation on every money path; human-readable diff ("sell X, buy Y, worst case Z"); min-received + allowance-cap validation | Action 5 (diff UI: 0001-M2) |
| Execution           | Client signing + 7702 atomic (`forceAtomic`) real ([executeDepositPlan.ts](../../packages/app-core/src/lib/wallet/executeDepositPlan.ts)); sequential exists as a type but no auto-fallback; leg state in-memory only ([useDepositExecutionState.ts](../../packages/app-core/src/hooks/useDepositExecutionState.ts))                                                                                                                                                                                                   | Persisted, resumable plan state machine driven by D5 events; sequential fallback                                                                   | D5 + Action 6               |
| Data / Indexing     | alpha-etl `alpha_raw` append-only ingestion ([004_create_wallet_token_snapshots_clean.sql](../../apps/alpha-etl/migrations/004_create_wallet_token_snapshots_clean.sql)); portfolio snapshots; no cost basis; no ledger                                                                                                                                                                                                                                                                                                | Event-sourced ledger; cost basis as a projection                                                                                                   | D5                          |
| (Desktop scheduler) | Notify + deep-link only, never signs ([rebalanceScheduler.ts](../../apps/desktop/src/main/scheduler/rebalanceScheduler.ts)) — at target                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                  | —                           |

## Non-goals (explicitly not building)

- Safe / ERC-4337 migration — D3 is 7702-native end to end (reaffirms 0001).
- Governance decentralization — "progressive decentralization" here means
  **verifiability and custody**, not a token or a DAO.
- A solver market now — D2 reserves the slot and the trigger, nothing more.
- Hosted server-side signing, ever — reaffirms 0001's non-goal; it is what
  N1/N2 forbid.
- New milestone numbering — the roadmap stays 0001's M1–M4; this ADR adds
  orthogonal action items only.
- Solidity development inside the current milestone window — Stage C is
  trigger-gated on Stage B's findings.
- Per-event real-time on-chain anchoring — daily digest cadence only.

## Consequences

- Easier: "can a hacked backend steal funds?" becomes a table lookup (N1–N3 ×
  custody tier × automation level) instead of a debate; the verifiable
  track-record story rides on already-shipped pipeline code; one ledger design
  simultaneously yields resumable execution, cost basis, activity history, and
  0001's L3 journal; the L3 security-review scope is now enumerable (local
  engine + on-chain floor + event log).
- Harder: account-engine takes on event-store discipline (insert-only grants,
  schema versioning, projection rebuilds); two policy layers must be kept from
  drifting apart (on-chain floor vs local engine); the Tier H/S split adds
  product and UX surface (graduation flow); Stage C, if reached, means an audit
  budget and a contracts toolchain.
- Revisit: Stage B feasibility as 7702 delegate ecosystems mature; anchoring
  cadence and Pinata cost; whether the decision-log chain merges into or runs
  beside the track-record chain; the solver-market trigger.

## Action items

New commitments only; anything already scheduled in 0001 is deferred there, not
duplicated.

- [x] A1. Challenge-signature ownership proof at wallet binding (sign a nonce
      at bind time) — D1/Identity. Server side shipped: challenge endpoint +
      verify-on-bind + `ownership_verified_at`; the signature is optional at
      the API so observe-only bundle wallets keep working — app-side signing
      UX rides with 0001-M1/M2
- [ ] A2. Timeboxed spike: can Ambire/OKX 7702 session scoping express
      whitelist + per-tx cap + revoke? Record findings — D3 Stage B
- [x] A3. Event schema + account-engine append-only event tables
      (signal/decision/plan/execution, carrying `strategyVersion`) — D5 phase 1.
      Shipped as the `ledger` module + `ledger_*_events` tables (insert-only
      grants + guard trigger); event producers wire in at 0001-M3 as planned
- [ ] A4. Fold a decision-log digest into the track-record CID chain — D5
      phase 2
- [ ] A5. Simulation-plane hardening: fail-closed simulation on the
      plan-orchestration path; server-side min-received validation against the
      intent; allowance-cap validation on approvals — D2/N-invariants
      (asset-diff rendering itself stays 0001-M2)
- [ ] A6. Sequential execution fallback + leg-state persistence from D5
      events — Execution plane
- [x] A7. Doc map: docs/README.md ADR index + root CLAUDE.md
      architecture-planes pointer — done with this ADR

Deferred to 0001's existing milestones: simulation diff UI → M2; first
rebalance decision events → M3; client-side allowlist assertions → M4; policy
engine, kill switch, shadow mode → 0001-D4 steps 7–8.
