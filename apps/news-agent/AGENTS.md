# News agent demo

Read ../AGENTS.md. Single-shot local CLI run with tsx: no daemon, watch runner,
database, control-center integration, or pnpm ops entry. The one exception is
`pnpm agent serve`: a 127.0.0.1-only trigger for the local AI Wallet button,
where each accepted `POST /runs` is exactly one `demo --execute` run of
`TRIGGER_EPISODE`. It allows one run at a time, needs the `x-zap-trigger`
header, and rejects non-localhost origins. Never bind it beyond loopback or
queue or retry runs.

- Only the isolated demo EOA created by `init` signs. Its key lives outside the
  repo in `~/.zap-news-agent/agent.key` (0600) and must never be printed,
  logged, committed, or sent anywhere. Never use user wallets, delegations, or
  session keys; expansion requires the shared Unattended wallet policy.
- Keep the wallet below $5 and refill manually: the balance is the real spending
  boundary; `guard.ts` is defense in depth. Revoke by moving the balance or
  revoking the MultiBaas API key.
- Laya is non-blocking analysis for people. It never gates or shapes the trade
  and never chooses keys, contracts, or amounts; the action is fixed in
  `demoRule.ts`. Do not describe Laya as deciding the trading strategy.
- Plan exclusively through plan-orchestration `/rotate/review`. Sign only when
  the guard passes. Approve, redeem and deposit must be composed by MultiBaas
  with `to/data/value` equal to the reviewed plan byte for byte. The LI.FI swap
  cannot be composed: sign its reviewed `to/data/value` unchanged, never
  re-encode it, and broadcast it through MultiBaas like every other step. Use
  the raw `wethtoken`/`usdctoken` ABIs: MultiBaas's built-in `erc20interface`
  rescales amounts by `decimals()` and changes calldata.
- The review is always a `warning` because plan-orchestration leaves LI.FI
  calldata undecoded. The guard may accept only that `UNDECODED_METHOD` on the
  swap, and only because it decodes and pins the swap itself.
- One attempt per step. A revert, timeout, or mismatch stops the run; never
  retry automatically or reuse a nonce by hand.
- A confirmed receipt does not mean MultiBaas gas estimation sees that block
  yet. Waiting for the `allowance` (after an approve) or the swapped USDC
  balance (after the swap) is a read, not a retry; a failed step must never be
  composed or submitted again. Each step's nonce must follow the previous one.
- Only `--execute` signs. `--replay` never sends a transaction and must stay
  labelled as a replay everywhere it is shown.
- Podcast data is read-only.
