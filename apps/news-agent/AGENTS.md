# News agent demo

Read ../AGENTS.md. Single-shot local CLI run with tsx: no daemon, watch runner,
HTTP server, database, control-center integration, or pnpm ops entry.

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
- Plan exclusively through plan-orchestration `/deposit/review`. Sign only when
  the guard passes and MultiBaas-composed `to/data/value` equal the reviewed
  plan byte for byte. Use the raw `usdctoken` ABI for USDC: MultiBaas's built-in
  `erc20interface` rescales amounts by `decimals()` and changes calldata.
- One attempt per step. A revert, timeout, or mismatch stops the run; never
  retry automatically or reuse a nonce by hand.
- Only `--execute` signs. `--replay` never sends a transaction and must stay
  labelled as a replay everywhere it is shown.
- Podcast data is read-only.
