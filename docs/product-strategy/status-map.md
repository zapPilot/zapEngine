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
| Positioning | Partial | Landing direction is clear: self-custodial investment autopilot / robo-advisor, not wallet/fund/yield/dashboard. | Need landing-page copy, objections page, and security model copy to match the actual trust model. | Test two landing angles from the 30-day plan. |
| Wedge / trust ladder | Open | Recommended ladder captured: free regime signal -> Parking Strategy -> signed rebalance. | No public signal channel, parking funnel, pricing test, or user cohort yet. | Launch the smallest public signal + track-record proof before adding features. |
| EIP-7702 direction | Partial | The repo already has capability detection via `wallet_getCapabilities`, delegation inspection, and EIP-7702 execution paths. Ambire and OKX are supported delegates; MetaMask is marked unsupported. | Generic execution still expects EIP-7702 capability; no polished BYO-EOA first-class product path, no revoke UX, no on-chain policy floor. | Make BYO-EOA the primary whale path; add visible revoke / delegate-status explanation. |
| Privy role | Partial | App-core wraps Privy behind `useWalletProvider()` and does not make every app component import Privy directly. | `WalletProvider` is still Privy-only in practice; Privy-specific API types live in `@zapengine/types/api`; hosted-wallet path does not satisfy the long-term self-custody promise. | Define wallet-adapter boundary and prevent more Privy type leakage outside execution modules. |
| Blind signing / server-side calldata | Partial | Privy relay now prepares a Tenderly-backed simulation preview, creates batch/calls hashes, returns EIP-712 typed data, verifies user signature, requires risk acknowledgement for warnings, and re-simulates before send. | Still no on-chain target whitelist / per-tx cap / revoke floor; plan-orchestration and generic intent paths do not have the same fail-closed simulation gate. | Treat this as reduced risk, not closed. Next: min-received and allowlist validation across money paths. |
| Simulation plane | Partial | Real Tenderly simulation exists on the Privy prepare/confirm rail with calls, asset changes, approvals, warnings, share URLs, fingerprints, and risk hashes. | Intent-engine simulation adapter is still a Noop/stub; simulation is not mandatory on every money-moving path; no server-side `toAmountMin` sanity check. | Implement Action A5 from ADR 0002 before pushing automation beyond human-reviewed L2. |
| Human-readable diff | Partial | Simulation preview schema contains enough structured evidence: asset changes, approvals, contract verification, warnings. | Confirm UI still needs to present the decisive user language: sell X, buy Y, route, worst case, approvals, failure outcome. | Make simulation diff the main confirm screen, not a hidden debug panel. |
| Append-only ledger | Open | ADR 0002 makes the ledger/event-chain direction explicit: signal -> decision -> plan -> execution; account-engine owns persistence. | No event tables, insert-only grants, cost-basis projection, or resumable execution event stream yet. | Build internal event tables before public anchoring. |
| Public track record | Partial | ADR 0002 records that a daily snapshot pipeline already exists: signed snapshots, IPFS pinning, `previousCid`, verifier. | It does not yet capture signal -> decision causality, config identity, or strategyVersion on every decision event. | Extend the track-record chain after the internal ledger lands. |
| Execution persistence | Open | Deposit wizard tracks bridge and Hyperliquid arrival in client state. | Refresh/session loss can still strand the UX because per-leg execution state is not server-persisted. | Persist plan ID and per-leg events via the ledger/event store. |
| Strategy versioning | Partial | Analytics strategy configs and suggestions exist; ADR 0002 requires explicit strategyVersion on decision events. | Strategy changes are not yet impossible to dispute from the public track record. | Add strategyVersion/config identity to decision events. |
| HLP / Hyperliquid flow | Partial | HLP deposit flow is implemented enough to load a plan, submit Base batch, poll bridge/perp USDC arrival, and submit gasless vault deposit. | It is a feature/hook, not the primary wedge; platform risk and decimals/chain quirks remain. | Use as a CT/content hook only if it helps the trust ladder; do not let it own positioning. |
| Parking Strategy | Open | Strategic role is decided: lowest-risk first-money entry. | Product surface, routing fee, risk copy, and cohort measurement are not visible here. | Define one-chain Parking Strategy flow and use it with design partners. |
| Telegram signal channel | Open | Telegram infrastructure exists elsewhere in the app, and fable5 recommends public regime distribution. | No public regime channel, viral loop, or paid-signal test. | Start with read-only public signal + track-record link, not signing links. |
| Pricing | Open | Revenue path decided: routing fee -> subscription -> portfolio-size tiers later. | No smoke test, no paywall, no LI.FI fee config rollout evidence in this status map. | Add a paid-signal or auto-bundle smoke test in Week 4. |
| DAO / Safe / FO / fund allocator | Deferred | Explicitly rejected as primary ICP for this stage. | None for 30 days. | Revisit only after whale PMF evidence + audited/live track record. |

## Highest-risk open items

1. PMF is still unproven. The repo has strong architecture discipline, but not user proof.
2. The trust story is partially real but not yet marketing-safe as an absolute claim. `held by no one else` must be phrased carefully while Privy/Tier H and off-chain allowlists exist.
3. Simulation is now real on one execution rail, but not yet a universal fail-closed invariant.
4. There is no append-only event ledger yet; without it, public track record and resumable execution remain partial.
5. Design-partner discovery is more urgent than additional adapter work.

## Update rule

When a task lands, update the row with:

- PR or commit link
- before/after behavior
- metric or user evidence, if any
- whether the row moves from `Open` -> `Partial` or `Partial` -> `Solved`
