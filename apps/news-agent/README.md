# Zap Agent: news-triggered on-chain agent (Curvegrid demo)

## One-sentence summary

For any podcast news story, a local model (Laya) analyzes it for context, and a
guardrailed agent wallet then makes one fixed move, depositing exactly 0.1
USDC into the Spark USDC vault on Base. Every transaction is composed, broadcast,
verified, and indexed through MultiBaas; the agent then pushes a Telegram story
link and the evidence shows live on
[v2.zap-pilot.org/ai-wallet](https://v2.zap-pilot.org/ai-wallet).

```text
News (podcast API) → Laya analysis (local, non-blocking) → fixed action
  → plan-orchestration review (intent-engine + Tenderly) → guard
  → MultiBaas compose → byte-equal check vs plan → local EOA signs
  → MultiBaas submit → MultiBaas receipt → MultiBaas Deposit event index
  → MultiBaas view calls (position) → Telegram smart link → AI Wallet tab
```

Laya does not decide or shape the trade: its analysis is shown to people, and
if the model is down or fails the run continues without it. The model never
touches keys, contract addresses, or amounts. The only action the agent can
take is hard-coded in `src/services/demoRule.ts`: approve (only when the
remaining allowance is short) and deposit 0.1 USDC into
`0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A` for itself, before 2026-10-04.

The dashboard has no backend: the CLI prints (and sends to Telegram) a link
like `/ai-wallet?episode=<id>&hack=…&eth=…` so the tab can show the story and
Laya's analysis for that run. Everything about transactions is read from chain.

## MultiBaas usage

Base Mainnet deployment (chain ID 8453). MultiBaas is the agent's whole chain
interface; no other RPC is used by the CLI.

| Step      | MultiBaas API                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Setup     | `POST /contracts/{label}` uploads raw ABIs (`usdctoken` = viem `erc20Abi`, `sparkusdcvault` = viem `erc4626Abi`)    |
|           | `POST /chains/ethereum/addresses` aliases `usdc` and `sparkusdcvault`                                               |
|           | `POST /chains/ethereum/addresses/{alias}/contracts` links them with `startingBlock` = current block for the indexer |
| Compose   | `POST …/addresses/{alias}/contracts/{label}/methods/{approve,deposit}` with `from` returns an unsigned EIP-1559 tx  |
| Broadcast | `POST /chains/ethereum/transactions/submit` with the locally signed raw tx                                          |
| Confirm   | `GET /chains/ethereum/transactions/receipt/{hash}` (status + decoded `Approval`/`Transfer`/`Deposit` events)        |
| Index     | `GET /events?tx_hash=…&contract_label=sparkusdcvault&event_signature=Deposit(address,address,uint256,uint256)`      |
| Read      | view calls `balanceOf` + `convertToAssets` (vault) and `balanceOf` (USDC) for the live position                     |
| Replay    | `GET /chains/ethereum/transactions/{hash}` + receipt to prove a past tx was a successful agent → vault deposit      |

Safety properties of the MultiBaas integration:

- The authoritative plan comes from account-engine
  `/plan-orchestration/deposit/review`. The agent signs only if the
  MultiBaas-composed `from/to/data/value` are identical to the reviewed plan,
  the guard still passes (review `passed`, exact vault, receiver, amount,
  fingerprint, > 60 s before expiry), and gas/fees are within demo bounds.
- The deposit is composed only after the approve receipt is confirmed and the
  MultiBaas `allowance` view call reads the approved amount, because MultiBaas
  gas estimation needs the allowance. Waiting is a read, not a retry: after 30 s
  the run stops without composing the deposit.
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
# Fund the printed address on Base with ~3 USDC + 0.0005 ETH (keep < $5).

# 2. Register contracts and aliases (idempotent).
pnpm --filter @zapengine/news-agent agent multibaas-setup

# 3. Local Laya model (optional: the run continues without it).
LAYA_PRELOAD=1 LAYA_DEVICE=mps uvx --from 'laya[serve]' laya-serve

# 4. Dry-run with any existing episode (no signing).
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent demo --episode <episodes.id>

# 5. Real transaction, then Telegram.
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/news-agent agent demo --episode <episodes.id> --execute

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

Owner to add further observations from the live demo.
