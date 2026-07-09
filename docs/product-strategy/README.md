# Product strategy workspace

Status: living workspace  
Last updated: 2026-07-07  
Source memo: fable5 ICP / wedge / trust / 30-day plan review

This folder turns strategic critique into an execution surface. It should stay small, blunt, and updated after each execution cycle.

## North star

Zap Pilot is not a wallet, fund, yield vault, or dashboard.

> A self-custodial investment autopilot for crypto-native high-net-worth individuals: buy in fear, defend in greed, and sign from the wallet they already own.

Engineering trust north star:

> My backend gets fully hacked — your money still cannot move outside the user-authorized and policy-bounded path.

## Current primary decisions

| Area | Decision |
| --- | --- |
| Primary ICP | Crypto-native high-net-worth individuals with roughly $50k-$5M on-chain, already self-custodying, too busy to watch markets all day. |
| Fallback ICP | Small crypto-native team treasuries or small fund operators handled manually as concierge design partners. Do not support DAO governance or Safe flows yet. |
| Category | Self-custodial robo-advisor. Say less about cross-chain, more about discipline. |
| Conversion line | `Your net worth, on autopilot` + `signed from your wallet, held by no one else`. Note: this line is already live on the landing page while the trust model is still Tier H/Privy — keeping it honest is an open action (see Positioning in [status-map.md](./status-map.md)). |
| Wedge | Trust ladder: public regime signal -> Parking Strategy first deposit -> signed rebalance. |
| Near-term revenue | Routing/integrator fee first; subscription for automation/signals second; avoid AUM/performance fees. |
| Architecture bias | Keep EIP-7702. Make BYO-EOA first-class. Keep Privy as one onboarding rail, not the product identity. Per the 2026-07-07 session-scoping spike, Ambire/OKX delegates cannot express the policy floor; Stage B targets the MetaMask Delegation Framework. |

## Files

- [status-map.md](./status-map.md) — which fable5 concerns are solved, partially solved, or still open.
- [30-day-pmf-plan.md](./30-day-pmf-plan.md) — execution plan for the next product-market-fit sprint.
- [fable5-question-backlog.md](./fable5-question-backlog.md) — questions to ask fable5 after the next concrete delta.

## Update loop

1. Pick one P0 item from [30-day-pmf-plan.md](./30-day-pmf-plan.md).
2. Ship or measure it.
3. Update [status-map.md](./status-map.md) with links to PRs, metrics, screenshots, or external evidence.
4. Ask fable5 only with the delta since the last memo, not the whole repo story again.
5. Add the best new questions to [fable5-question-backlog.md](./fable5-question-backlog.md).

## Hard no for the next 30 days

- No new protocol adapters unless they directly unlock the Parking Strategy or one design partner.
- No DAO treasury / Safe flow.
- No family office or allocator positioning.
- No custom wallet or Ambire fork.
- No dashboard competition against Zerion / DeBank.
- No desktop-native feature work.
- No mobile app polish unless it blocks a design partner.
- No cross-chain as the wedge. Cross-chain is execution infrastructure, not the opening pitch.
