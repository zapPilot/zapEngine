# Fable5 status map

Status legend:

- `Solved` — implemented or documented well enough to stop debating the direction.
- `Partial` — meaningful work exists, but the fable5 risk is not fully closed.
- `Open` — not yet implemented or not yet validated.
- `Deferred` — explicitly not a 30-day priority.

Last updated: 2026-07-07

## Snapshot

| Theme | Status | What is solved now | Remaining gap | Next action |
| --- | --- | --- | --- | --- |
| Primary ICP | Open | Strategic decision captured here: crypto-native self-custody whales are the primary ICP. | No interview evidence, design-partner commitments, wallet-connect conversion data, or second-signature metric yet. | Run 15-20 target-user interviews; recruit 5 concierge design partners. |
| Positioning | Partial | Landing direction is clear: self-custodial investment autopilot / robo-advisor, not wallet/fund/yield/dashboard. The landing repositioning is live: hero ships `Your net worth, on autopilot.` and `signed from your wallet, held by no one else`. | The live claim runs ahead of the trust model (Privy/Tier H still exists); objections page and honest security-model page are still missing. | Ship the security-model page with honest current-stage wording; test angle B against the live angle A. |
| Wedge / trust ladder | Open | Recommended ladder captured: free regime signal -> Parking Strategy -> signed rebalance. | No public signal channel, parking funnel, pricing test, or user cohort yet. | Launch the smallest public signal + track-record proof before adding features. |
| EIP-7702 direction | Partial | The repo already has capability detection via `wallet_getCapabilities`, delegation inspection, and EIP-7702 execution paths. Ambire and OKX are supported delegates; MetaMask is marked unsupported. The 2026-07-07 session-scoping spike concluded Ambire/OKX cannot express the policy floor; Stage B is rescoped to the MetaMask Delegation Framework. | Generic execution still expects EIP-7702 capability; no polished BYO-EOA first-class product path, no revoke UX, no on-chain policy floor. | Make BYO-EOA the primary whale path; add visible revoke / delegate-status explanation. |
| Privy role | Partial | App-core wraps Privy behind `useWalletProvider()` and does not make every app component import Privy directly. | `WalletProvider` is still Privy-only in practice; Privy-specific API types live in `@zapengine/types/api`; hosted-wallet path does not satisfy the long-term self-custody promise. | Define wallet-adapter boundary and prevent more Privy type leakage outside execution modules. |
| Blind signing / server-side calldata | Partial | Privy relay now prepares a Tenderly-backed simulation preview, creates batch/calls hashes, returns EIP-712 typed data, verifies user signature, requires risk acknowledgement for warnings, and re-simulates before send. | Still no on-chain target whitelist / per-tx cap / revoke floor; plan-orchestration and generic intent paths do not have the same fail-closed simulation gate. | Treat this as reduced risk, not closed. Next: min-received and allowlist validation across money paths. |
| Simulation plane | Partial | Real Tenderly simulation exists on the Privy prepare/confirm rail with calls, asset changes, approvals, warnings, share URLs, fingerprints, and risk hashes. Intent-engine now also has a real `createTenderlyBundleSimulationAdapter` (simulate-bundle API, fail-closed verdicts) plus plan-safety validators `assertApprovalCaps` / `assertMinReceived` (server-side `toAmountMin` and approval-cap checks); Noop remains only as an explicit fallback. | Plan-orchestration is not wired to the bundle gate yet; simulation is still not mandatory on every money-moving path. | Wire the bundle gate + validators into plan-orchestration (enforce mode, 400/422/503 mapping). |
| Human-readable diff | Partial | Simulation preview schema contains enough structured evidence: asset changes, approvals, contract verification, warnings. | Confirm UI still needs to present the decisive user language: sell X, buy Y, route, worst case, approvals, failure outcome. | Make simulation diff the main confirm screen, not a hidden debug panel. |
| Append-only ledger | Partial | Event tables landed (migration `20260707000001`): `ledger_{signal,decision,plan,execution}_events` with REVOKE UPDATE/DELETE/TRUNCATE plus a guard trigger, and an insert-only `LedgerService` in account-engine. | No producers write to the ledger yet — event wiring is deferred to the rebalance milestone — and there is no API surface, projection, or frontend consumption. | Wire signal/decision/plan/execution producers, then fold a decision-log digest into the track-record chain. |
| Public track record | Partial | A daily snapshot pipeline already exists: signed snapshots, IPFS pinning, `previousCid`, verifier. | It does not yet capture signal -> decision causality, config identity, or strategyVersion on every decision event. | Extend the track-record chain after the internal ledger lands. |
| Execution persistence | Partial | `ledger_execution_events` exists and is explicitly designated the resumable per-leg state store and L3 journal. Deposit wizard tracks bridge and Hyperliquid arrival in client state. | Nothing writes per-leg events yet, so refresh/session loss can still strand the UX. | Wire plan ID + per-leg execution events through the ledger, after producer wiring. |
| Strategy versioning | Partial | Ledger schema now enforces `strategy_version` + `config_identity` as required fields on every decision event (migration `20260707000001` + zod input schema). | Decision producers are not wired, so no live decision carries a version yet; the public track record still cannot prove which strategy version acted. | Wire decision producers through the ledger, then surface strategyVersion in the public track record. |
| HLP / Hyperliquid flow | Partial | HLP deposit flow is implemented enough to load a plan, submit Base batch, poll bridge/perp USDC arrival, and submit gasless vault deposit. | It is a feature/hook, not the primary wedge; platform risk and decimals/chain quirks remain. | Use as a CT/content hook only if it helps the trust ladder; do not let it own positioning. |
| Parking Strategy | Open | Strategic role is decided: lowest-risk first-money entry. | Product surface, routing fee, risk copy, and cohort measurement are not visible here. | Define one-chain Parking Strategy flow and use it with design partners. |
| Telegram signal channel | Open | Telegram infrastructure exists elsewhere in the app, and fable5 recommends public regime distribution. | No public regime channel, viral loop, or paid-signal test. | Start with read-only public signal + track-record link, not signing links. |
| Pricing | Open | Revenue path decided: routing fee -> subscription -> portfolio-size tiers later. | No smoke test, no paywall, no LI.FI fee config rollout evidence in this status map. | Add a paid-signal or auto-bundle smoke test in Week 4. |
| DAO / Safe / FO / fund allocator | Deferred | Explicitly rejected as primary ICP for this stage. | None for 30 days. | Revisit only after whale PMF evidence + audited/live track record. |

## Highest-risk open items

1. PMF is still unproven. The repo has strong architecture discipline, but not user proof.
2. The trust story is partially real but not yet marketing-safe as an absolute claim. `held by no one else` must be phrased carefully while Privy/Tier H and off-chain allowlists exist — and the landing page already ships this line, which raises the urgency of an honest security-model page.
3. Simulation is now real on one execution rail, but not yet a universal fail-closed invariant.
4. The append-only ledger tables now exist, but no producers write to them and nothing is exposed to the API or frontend; until producer wiring lands, public track record and resumable execution remain partial.
5. Design-partner discovery is more urgent than additional adapter work.

## Update rule

When a task lands, update the row with:

- PR or commit link
- before/after behavior
- metric or user evidence, if any
- whether the row moves from `Open` -> `Partial` or `Partial` -> `Solved`
