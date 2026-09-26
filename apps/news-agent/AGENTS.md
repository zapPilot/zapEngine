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
- Plan exclusively through plan-orchestration `/deposit/review`. Sign only when
  the guard passes and MultiBaas-composed `to/data/value` equal the reviewed
  plan byte for byte. Use the raw `usdctoken` ABI for USDC: MultiBaas's built-in
  `erc20interface` rescales amounts by `decimals()` and changes calldata.
- One attempt per step. A revert, timeout, or mismatch stops the run; never
  retry automatically or reuse a nonce by hand.
- A confirmed approve receipt does not mean MultiBaas gas estimation sees the
  allowance yet. Waiting for the `allowance` view call is a read, not a retry;
  a failed step must never be composed or submitted again.
- Only `--execute` signs. `--replay` never sends a transaction and must stay
  labelled as a replay everywhere it is shown.
- Podcast data is read-only.
