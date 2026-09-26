# Zap Agent: news-triggered on-chain agent (Curvegrid demo)

## One-sentence summary

For any podcast news story (the demo story is the Bitget hack), a local model
(Laya) analyzes it for context, and a guardrailed agent wallet then makes one
fixed move on Base: it rotates exactly 0.0001 shares of the Clearstar Core ETH
vault into the Spark USDC vault. The agent produces a reviewed intent. LI.FI
routes the swap; MultiBaas is the execution and verification spine — composing
protocol calls where applicable, broadcasting locally signed transactions, and
returning receipts and decoded on-chain evidence. The agent then pushes a
Telegram story link and the evidence shows live on
[v2.zap-pilot.org/ai-wallet](https://v2.zap-pilot.org/ai-wallet).

```text
News (podcast API) → Laya analysis (local, non-blocking) → fixed action
  → plan-orchestration /rotate/review (intent-engine + LI.FI quote + Tenderly) → guard
  → per step: approve / redeem / deposit composed by MultiBaas, byte-equal to the plan
              LI.FI swap signed exactly as reviewed (MultiBaas cannot compose it)
  → local EOA signs → MultiBaas submit → MultiBaas receipt
  → MultiBaas Deposit event index → MultiBaas view calls (position)
  → Telegram smart link → AI Wallet tab
```

Laya does not decide or shape the trade: its analysis is shown to people, and
if the model is down or fails the run continues without it. The model never
touches keys, contract addresses, or amounts. The only action the agent can
take is hard-coded in `src/services/demoRule.ts`, for itself, before
2026-10-04:

1. approve WETH to the LI.FI diamond and USDC to the Spark vault, each only when
   the remaining allowance is short;
2. redeem 0.0001 shares of Clearstar Core ETH
   (`0xBCA4E2E24A7cFa776E4282CC8Eb06f04738b71da`, a Morpho Vault V2) into WETH;
3. swap that WETH into USDC through the LI.FI route in the reviewed plan;
4. deposit exactly the swap's guaranteed minimum into Spark USDC
   (`0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A`). A better fill stays idle.

The rotation runs at the current market price. The story explains why an
exchange hack can move ETH; the demo claims no profit from it.

The dashboard has no backend: the CLI prints (and sends to Telegram) a link
like `/ai-wallet?episode=<id>` so the tab can show the story for that run.
Everything about transactions is read from chain.

## MultiBaas usage

Base Mainnet deployment (chain ID 8453). MultiBaas is the agent's whole chain
interface; no other RPC is used by the CLI.

| Step      | MultiBaas API                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup     | `POST /contracts/{label}` uploads raw ABIs (`wethtoken`/`usdctoken` = viem `erc20Abi`, `clearstarethvault`/`sparkusdcvault` = viem `erc4626Abi`) |
|           | `POST /chains/ethereum/addresses` aliases `weth`, `clearstarethvault`, `usdc` and `sparkusdcvault`                                               |
|           | `POST /chains/ethereum/addresses/{alias}/contracts` links them with `startingBlock` = current block for the indexer                              |
| Compose   | `POST …/addresses/{alias}/contracts/{label}/methods/{approve,redeem,deposit}` with `from` returns an unsigned EIP-1559 tx                        |
| Broadcast | `POST /chains/ethereum/transactions/submit` with every locally signed raw tx, including the LI.FI swap                                           |
| Confirm   | `GET /chains/ethereum/transactions/receipt/{hash}` (status + decoded `Approval`/`Withdraw`/`Transfer`/`Deposit` events)                          |
| Wait      | view calls `allowance` after an approve and USDC `balanceOf` after the swap, before composing the next step                                      |
| Index     | `GET /events?tx_hash=…&contract_label=sparkusdcvault&event_signature=Deposit(address,address,uint256,uint256)`                                   |
| Read      | view calls `balanceOf` + `convertToAssets` (both vaults) and `balanceOf` (USDC) for the live position                                            |
| Replay    | `GET /chains/ethereum/transactions/{hash}` + receipt to prove a past tx was a successful agent → Spark vault deposit                             |

Safety properties of the MultiBaas integration:

- The authoritative plan comes from account-engine
  `/plan-orchestration/rotate/review`. The guard pins the chain, both vaults,
  the share amount, every receiver, the LI.FI target and swap selector, both
  approvals, the batch fingerprint, and > 60 s left before expiry. It also
  decodes the LI.FI calldata itself: the swap must pay the agent, sell WETH for
  USDC, and guarantee exactly the amount the deposit spends.
- plan-orchestration never decodes LI.FI calldata, so the review is always a
  `warning` with one `UNDECODED_METHOD` on the swap. The guard accepts that one
  warning and nothing else; any other warning, or a `failed`/`unavailable`
  review, blocks the run.
- Approve, redeem and deposit are signed only if the MultiBaas-composed
  `from/to/data/value` equal the reviewed plan. The LI.FI swap is never
  re-encoded: its reviewed `to/data/value` are signed as-is with the next nonce
  and the fee caps MultiBaas composed for the redeem. Every nonce must follow
  the previous one.
- Gas limits are 1.5x the MultiBaas estimate (capped at 500k), and the swap uses
  LI.FI's own limit (capped at 2M). Unused gas is not charged.
- The next step is composed only once MultiBaas reads the previous one: the
  `allowance` after an approve and the swapped USDC after the swap, because
  MultiBaas gas estimation lags its receipts. Waiting is a read, not a retry:
  after 30 s the run stops without composing the next step. A stop between
  steps leaves WETH or USDC idle in the agent wallet; nothing is lost.
- Any mismatch, revert, or 90 s receipt timeout stops the run. Nothing retries.

## Team

Owner to supply team names and hackathon details before submission.

## Setup and testing

Node 24, pnpm 10.30.3, [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
pnpm turbo run build --filter=@zapengine/news-agent^...

# 1. Isolated agent wallet + MultiBaas credentials in ~/.zap-news-agent (0600).
pnpm --filter @zapengine/news-agent agent init \
  --multibaas-url https://<deployment>.multibaas.com --multibaas-key-file <api-key-file>
# Fund the printed address on Base with a small Clearstar Core ETH position
# (≈0.0004 WETH covers 3 runs) plus ~0.0005 ETH for gas (keep < $5).

# 2. Register contracts and aliases (idempotent).
pnpm --filter @zapengine/news-agent agent multibaas-setup

# 3. Local Laya model (optional: the run continues without it).
LAYA_PRELOAD=1 LAYA_DEVICE=mps uvx --from 'laya[serve]' laya-serve

# 4. Dry-run with any existing episode (no signing).
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent demo --episode <episodes.id>

# 5. Real transaction, then Telegram.
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent demo --episode <episodes.id> --execute

# 5b. Local AI Wallet "Run agent now" button: serves 127.0.0.1:8787; each
#     click is one real --execute run of TRIGGER_EPISODE (src/services/demoRule.ts).
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent serve

# 6. Re-show the story without spending: verifies the tx via MultiBaas, then notifies as a replay.
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent demo --episode <episodes.id> --replay <txHash>
```

The CLI reads `ACCOUNT_API_URL`, `PODCAST_API_URL`,
`PIPELINE_TELEGRAM_BOT_TOKEN`, and `PIPELINE_TELEGRAM_ALLOWED_USER_IDS` (first ID
is the default chat; override with `--chat=<id>`). `--laya-url` defaults to
`http://127.0.0.1:8000`. Only `--execute` signs and spends.

```bash
pnpm turbo run lint type-check test:coverage deadcode --filter=@zapengine/news-agent
pnpm --filter @zapengine/news-agent format:check
pnpm --filter @zapengine/news-agent dup:check
```

## MultiBaas feedback

- The built-in `erc20interface` applies a `decimals` type conversion to
  `approve(tokens)` and `balanceOf` output, so `"1000000"` means one million
  USDC, not 1 USDC. An agent that must match a reviewed plan byte for byte needs
  a raw ABI; we upload viem's `erc20Abi` as `usdctoken`.
- Uploading an interface-only contract fails with a database not-null error
  unless `bin` is sent (an empty string works).
- `GET /chains/ethereum/addresses` omits linked contracts; idempotent setup has
  to read each alias individually.
- Composing a transaction from an unfunded address fails gas estimation
  (`gas required exceeds allowance (0)`), and `gas` cannot be supplied to skip
  it.
- A transaction receipt becomes available before the same deployment's gas
  estimation sees that block. The first live run composed the deposit right
  after the approve receipt, and estimation reverted with
  `ERC20: transfer amount exceeds allowance`. The agent now waits until an
  `allowance` view call reads the approval.
- The composed `gas` is the exact estimate with no headroom. The first live
  deposit used that limit as-is and ran out of gas at exactly 259,547, because
  the Morpho vault's deposit path cost more in the mined block. The agent now
  signs with a 1.5x buffer.
- Compose covers methods of uploaded ABIs only. A DEX aggregator route (LI.FI)
  arrives as finished calldata from the quote, so the agent signs it exactly as
  reviewed and broadcasts it with `transactions/submit`; MultiBaas still returns
  its receipt and decodes the events of linked contracts. Nonce and fee caps for
  that transaction come from the MultiBaas-composed step before it.

Owner to add further observations from the live demo.
