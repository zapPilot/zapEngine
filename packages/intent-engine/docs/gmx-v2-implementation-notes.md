# GMX v2 Implementation Notes

## Gate 0 - LiFi Composer Native Value Probe

Date: 2026-05-15

### Connection Probe

Request:

```json
{
  "fromChain": "42161",
  "toChain": "42161",
  "fromToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "toToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  "chainTypes": "EVM"
}
```

Raw response:

```json
{
  "connections": [
    {
      "fromChainId": 42161,
      "toChainId": 42161,
      "fromTokens": [
        {
          "address": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          "chainId": 42161
        }
      ],
      "toTokens": [
        {
          "address": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          "chainId": 42161
        }
      ]
    }
  ]
}
```

### Contract-Call Quote Probe

Request used a hand-encoded `ExchangeRouter.multicall(bytes[])` destination call:

```json
{
  "fromChain": "42161",
  "toChain": "42161",
  "fromToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "toToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  "fromAmount": "1000000",
  "fromAddress": "0x000000000000000000000000000000000000dEaD",
  "slippage": "0.03",
  "contractCalls": [
    {
      "toContractAddress": "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41",
      "toContractCallData": "0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000",
      "toContractGasLimit": "1000000",
      "fromAmount": "1",
      "fromTokenAddress": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
    }
  ]
}
```

Raw response fields that gate the architecture:

```json
{
  "type": "lifi",
  "tool": "custom",
  "action": {
    "fromChainId": 42161,
    "toChainId": 42161,
    "fromToken": {
      "address": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      "symbol": "USDC",
      "decimals": 6
    },
    "toToken": {
      "address": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      "symbol": "WETH",
      "decimals": 18
    },
    "fromAmount": "1000000"
  },
  "estimate": {
    "tool": "custom",
    "approvalAddress": "0x5741A7FfE7c39Ca175546a54985fA79211290b51",
    "toAmountMin": "0",
    "toAmount": "0",
    "fromAmount": "1000000"
  },
  "includedSteps": [
    { "type": "protocol", "tool": "feeCollection" },
    { "type": "swap", "tool": "fly" },
    {
      "type": "custom",
      "tool": "custom",
      "action": {
        "toContractAddress": "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41",
        "toContractCallData": "0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000",
        "callDataGasLimit": "1000000"
      }
    }
  ],
  "transactionRequest": {
    "value": "0x0",
    "to": "0x2dfaDAB8266483beD9Fd9A292Ce56596a2D1378D",
    "chainId": 42161,
    "from": "0x000000000000000000000000000000000000dEaD"
  }
}
```

Decision: Outcome B. LiFi Composer did not attach native value to the contract-call transaction (`transactionRequest.value` was `0x0`), so GMX deposits use LiFi only for same-chain USDC-to-collateral swaps and submit the GMX `ExchangeRouter.multicall` directly with native `value`.

## Live GMX Market Verification

Date: 2026-05-16

Read-only `SyntheticsReader.getMarket(DataStore, marketToken)` calls against Arbitrum confirmed the implemented market token, index token, long token, and short token mapping:

```json
{
  "btc-usdc": {
    "marketToken": "0x47c031236e19d024b42f8AE6780E44A573170703",
    "indexToken": "0x47904963fc8b2340414262125aF798B9655E58Cd",
    "longToken": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "shortToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  },
  "eth-usdc": {
    "marketToken": "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
    "indexToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "longToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "shortToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  },
  "btc-btc": {
    "marketToken": "0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77",
    "indexToken": "0x47904963fc8b2340414262125aF798B9655E58Cd",
    "longToken": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "shortToken": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"
  },
  "eth-eth": {
    "marketToken": "0x450bb6774Dd8a756274E0ab4107953259d2ac541",
    "indexToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "longToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "shortToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
  }
}
```

## Gate 1 - Single-collateral market deposit must fund both sides

Date: 2026-06-03

> **Superseded 2026-09-25 (Gate 4).** On the current contracts a single transfer funds a
> single-collateral market: `DepositUtils.createDeposit` calls `recordTransferIn` once per
> side, and the DepositVault books a token's whole balance change to the first side naming
> it, so two transfers of the same token are indistinguishable from one. A one-transfer
> WBTC.b deposit into `btc-btc` and a one-transfer native-ETH deposit into `eth-eth` both
> executed on a fork, keeper included; the June A/B below does not reproduce. The builder
> now always sends one transfer. The June notes are kept as history.

### Symptom

On a Tenderly Arbitrum fork, the full deposit batch
`[approve USDC→LiFi, approve collateral→GMX router, LiFi swap, ExchangeRouter.multicall]`
succeeded for the two-token markets (`btc-usdc`, `eth-usdc`) but **reverted with empty
revert data (`0x`) for the single-collateral markets** (`btc-btc`, `eth-eth`). The swap,
approvals, `sendWnt`, and `sendTokens` all executed; only `createDeposit` reverted, and it
reverted in `ExchangeRouter.createDeposit` **before** `DepositHandler.createDeposit` ran.

### Root cause

A GM market whose `longToken === shortToken` (e.g. GM BTC/USD `[WBTC.b-WBTC.b]`) rejects a
deposit funded on a single side. The original builder put the entire collateral on
`fundedSide` and emitted **one** `sendTokens`, which GMX rejects for these markets. They must
be funded on **both** sides — half long, half short — which emits **two** `sendTokens`,
exactly as the GMX UI does.

### Evidence

- Real on-chain GM BTC/BTC deposit
  [`0xfbce95c7…081c101`](https://arbitrum.blockscout.com/tx/0xfbce95c7dfb0753c3f83b0b46f91b6690339512e64f6099abd6d055bd081c101)
  (same `ExchangeRouter` `0x1C3fa76e…`) sends WBTC.b in two `sendTokens`: `112765` + `112766`.
- Controlled A/B on the fork (same block, same params, only the `sendTokens` shape differs):
  - single `sendTokens(WBTC.b, 145076)` → **revert** (`0x`)
  - two `sendTokens(WBTC.b, 72538)` + `sendTokens(WBTC.b, 72538)` → **success**
- Re-verified with the fixed builder's own output for both single-collateral markets:
  `btc-btc` (WBTC.b) and `eth-eth` (WETH — note WETH is also the execution-fee `wnt`, the
  split still succeeds). Two-token markets remain a single `sendTokens` (no regression).

### Fix

`depositSideAmounts()` in `src/builders/gmx-v2-supply.builder.ts` splits the collateral 50/50
across long and short when `longToken === shortToken`; two-token markets keep their
`fundedSide`-only funding.

### Keeper async boundary

`createDeposit` success means the deposit **order** was created (and `DepositCreated`
emitted). GMX keepers consume the `executionFee` (the "bit of ETH") off-chain to mint the GM
token to the receiver. (June's bar stopped at `createDeposit`; Gate 4 shows how to run the
keeper on a fork too.)

### Reproduce

Superseded by `examples/gmx-v2-deposit-fork-replay.ts` (Gate 4), which replays the real plan
and runs the keeper.

## Gate 2 - Dust deposits revert the swap (zero slippage buffer)

Date: 2026-06-03

> **Superseded for USDC, ETH, and WETH on 2026-09-25 (Gate 4).** Those funding tokens no
> longer pass through LI.FI: GMX's keeper swaps them inside the deposit, where the only
> slippage bound is the 18-decimal `minMarketTokens`, so there is nothing to round to zero.
> The guard below survives only for USDT's LI.FI USDT→USDC leg, a 6-decimal stable swap that
> keeps a real buffer down to cents (a $0.05 quote: `toAmount 49814`, `toAmountMin 49564`).

### Symptom

A real on-chain `btc-btc` deposit batch reverted with **no token transfers** — looking like
"the swap never happened". In fact the swap **was** built (LiFi
`swapTokensMultipleV3ERC20ToERC20`, USDC→WBTC); the whole EIP-7702 atomic batch reverted, so
nothing moved.

### Root cause

The deposit was dust (~`10003` USDC units ≈ $0.01). At that size LiFi cannot apply its
slippage buffer: the swap output is ~`15` 8-decimal WBTC units and 0.5% of 15 rounds to 0, so
the quote returns `toAmountMin === toAmount`. The on-chain swap's `minAmountOut` then has
**zero tolerance** and reverts inside LiFi `GenericSwapFacetV3` on any execution-time
rounding / price move. Because the batch is atomic, the GMX `multicall` (call #2) never runs.

### Evidence

- Reverted tx
  [`0x6b50bafe…79a1`](https://arbitrum.blockscout.com/tx/0x6b50bafe0f7b4a0c05be3fad0668581cdcc4f6480ed5eddda2deef0181ae79a1):
  Tenderly `get_error_path` → revert frame at the depth-2 delegatecall into
  `GenericSwapFacetV3` (LiFi). All DEX subcalls succeeded; the facet reverts at its final
  min-amount check. `token_transfers: []`.
- Live LiFi quotes (USDC→WBTC, slippage 0.5%, integrator `zap-pilot`):
  - $0.02 → `toAmount 29`, `toAmountMin 29` → **0 buffer**
  - $50 → `toAmount 74547`, `toAmountMin 74174` → real 0.5% buffer (succeeds)
- GMX execution fee is `0.001` ETH (~$1.87): dust deposits are also economically nonsensical,
  and the keeper would likely cancel a sub-minimum deposit.

### Fix

After fetching the swap quote, `buildGmxV2SupplyTx()` rejects when
`toAmountMin >= toAmount` (no buffer was applied → the swap will revert) with a clear
"deposit too small" error, instead of emitting a batch that reverts opaquely on-chain.
Real-sized deposits (`toAmountMin < toAmount`) are unaffected. Note `collateralAmount =
toAmountMin` still couples the GMX deposit amount to the swap floor; decoupling it (deposit
the actually-received WBTC, handle change) is possible future hardening, out of scope here.

### Verify with a real amount

Dust cannot succeed, so to prove the flow build a `btc-btc` plan with a realistic input
($20–50) and replay swap + `ExchangeRouter.multicall` on a Tenderly Arbitrum fork. Acceptance
bar identical to Gate 1: the swap delivers collateral and `createDeposit` submits without
revert (keeper mint stays off-chain).

## btc-btc funds the pool in WBTC.b, even when the wallet sends USDC

`btc-btc`/`eth-eth` are **single-collateral BTC/ETH** markets: the pool is only ever funded in
**WBTC.b / WETH**. Since Gate 4 the wallet sends its USDC into the DepositVault and names it
as `initialLongToken` with `longTokenSwapPath = [btc-usdc]` (or `[eth-usdc]`); GMX's keeper
swaps it into WBTC.b / WETH inside the deposit, then mints. A USDC `sendTokens` in a
`btc-btc` deposit is therefore expected. Do not confuse it with the separate **`btc-usdc`**
market, whose collateral _is_ USDC and which deposits USDC directly with no swap path.

Guarantees / proof:

- `gmx-v2-supply.builder.test.ts` asserts the `btc-btc`/`eth-eth` deposit names USDC as
  `initialLongToken`, the pool token as `initialShortToken`, and the hop market as the long
  swap path.
- `examples/gmx-v2-deposit-fork-replay.ts` shows the keeper's `DepositExecuted` and the GM
  mint for the real plan (Gate 4).

## Gate 3 - GMX upgraded its contracts; the old ExchangeRouter reverts everything

Date: 2026-09-25

### Symptom

A fork deposit through ExchangeRouter `0x1C3fa76e…6A41` reverted inside `sendTokens` with
`Unauthorized(0x1C3fa76e…, "ROUTER_PLUGIN")`.

### Root cause

GMX deployed a new ExchangeRouter `0x7dE39FF2e232A2203196788d37e234cF8F1b83f1` on
2026-07-14, together with new handlers (DepositHandler `0x2c60a189…2EAD`, WithdrawalHandler
`0xB25dDF7d…4925`), SwapHandler, Oracle, and SyntheticsReader
`0xfA26cBb46e2614609406de08CA1Dc7f70a684184`, and revoked the old router's roles: RoleStore
`0x3c3d99FD…6e72` returns `false` for both `hasRole(0x1C3f…, ROUTER_PLUGIN)` and
`hasRole(0x1C3f…, CONTROLLER)`. `Router.pluginTransfer` therefore rejects every `sendTokens`,
so every GMX deposit and withdrawal this package built since mid-July reverts on-chain (the
old router's most recent inbound multicalls, on 2026-09-22, all failed). `DataStore`,
`DepositVault`, `WithdrawalVault`, and the `Router` (the approval spender) did not change, so
existing allowances stay valid.

### Evidence

- RoleStore's `ROUTER_PLUGIN` members include `0x7dE39FF2…` (Blockscout-verified name
  `ExchangeRouter`), which also holds `CONTROLLER`; its `depositHandler()` and
  `withdrawalHandler()` are the new handlers, both `CONTROLLER`s.
- The GMX interface SDK (`sdk/src/configs/contracts.ts`, Arbitrum) lists the same
  ExchangeRouter and SyntheticsReader. The `gmx-synthetics` repo's `deployments/arbitrum` on
  `main` still showed the old router on 2026-09-25, so it is not a source of truth.
- Verified-source diff of old vs new: `IDepositUtils.CreateDepositParams` is identical,
  `IWithdrawalUtils` differs only in comments, and Reader `getDepositAmountOut` /
  `getSwapAmountOut` keep their signatures. `simulateExecuteLatest*` moved from the
  ExchangeRouter to a separate SimulationRouter (`0xaD3051cB…7ea`).

### Fix

`GMX_V2_ADDRESSES.exchangeRouter` and `.syntheticsReader` point at the new contracts. The real
`buildGmxV2Withdraw` output was replayed through the new router for `btc-btc`, `eth-eth`, and
`btc-usdc` with the keeper's `executeWithdrawal` (method as in Gate 4): `WithdrawalCreated`,
then `WithdrawalExecuted`, pool tokens received, GM burned.

### Detect the next upgrade

`examples/gmx-v2-deposit-fork-replay.ts` fails fast when
`RoleStore.hasRole(GMX_V2_ADDRESSES.exchangeRouter, CONTROLLER)` is false.

## Gate 4 - Fund pools through GMX swap paths (no dust floor)

Date: 2026-09-25

### Problem

Funding `btc-btc` from USDC went through a LI.FI USDC→WBTC.b swap. A basket leg of a few
cents (Stable 99% / Crypto 1% at the $10.64 minimum is $0.0532 per pool) is a two-digit sat
amount whose 0.5% buffer rounds to zero, so the builder threw `GmxDepositTooSmallError`
(Gate 2) even though GMX itself has no deposit minimum.

### Contract behavior (verified source of the live DepositHandler and SwapHandler)

- `createDeposit` calls `recordTransferIn(initialLongToken)`, then
  `recordTransferIn(initialShortToken)`; each returns the DepositVault's balance change since
  the last record. If either initial token is WNT (WETH) the execution fee is subtracted from
  that side; otherwise WNT is recorded separately and must cover the fee.
- At execution each side goes through `SwapUtils.swap` with its own path. A zero amount
  returns `(initialToken, 0)` without swapping, and the deposit then requires the output
  token to equal the market's long/short token, or reverts `InvalidSwapOutputToken` (the
  keeper cancels the deposit and refunds).
- Swap-path markets must be enabled two-token markets (`validateSwapMarket`), at most
  `MAX_SWAP_PATH_LENGTH` (3) long; every hop checks the tokenIn pool cap, reserve, and max PnL.

So a deposit funded by a non-pool token sends that token once, names it as one side's initial
token with a path into that side's pool token, and names the market's own token on the other,
zero-amount side. `encodeGmxV2CreateDepositMulticall` enforces exactly that shape.

### Controlled fork experiments

Hand-built multicalls, $0.0532 USDC / 0.00002 ETH / 60 sats, each followed by the keeper:

| Variant                                                           | createDeposit | Keeper                                        |
| ----------------------------------------------------------------- | ------------- | --------------------------------------------- |
| A `btc-btc`: USDC long via `[btc-usdc]`, short = WBTC.b           | ok            | `DepositExecuted`                             |
| B `btc-btc`: USDC on both sides, both paths `[btc-usdc]`          | ok            | `DepositCancelled` — `InvalidSwapOutputToken` |
| C `btc-btc`: USDC short via `[btc-usdc]`, long = WBTC.b           | ok            | `DepositExecuted`                             |
| D `eth-eth`: USDC long via `[eth-usdc]`, short = WETH (takes fee) | ok            | `DepositExecuted`                             |
| E `btc-btc`: native ETH long via `[eth-usdc, btc-usdc]`           | ok            | `DepositExecuted`                             |
| F `eth-eth`: native ETH, one `sendWnt(fee + amount)`              | ok            | `DepositExecuted`                             |
| G `btc-btc`: WBTC.b, one `sendTokens` (Gate 1 re-check)           | ok            | `DepositExecuted`                             |
| I `btc-usdc`: native ETH short via `[eth-usdc]`, long = WBTC.b    | ok            | `DepositExecuted`                             |

Every mint matched the Reader estimate (chained `getSwapAmountOut`, then
`getDepositAmountOut`) to within 0.01 bps at the same prices.

Method: variant A first ran on a Tenderly Virtual TestNet until the account's VNet quota ran
out (the Simulation API used by plan-orchestration was unaffected); all variants were then run
with `eth_simulateV1` on a public Arbitrum node — the wallet's calls and the keeper's
`DepositHandler.executeDeposit` in one simulated block on the latest state. The keeper is a
real `ORDER_KEEPER` from RoleStore. The only mock is the oracle provider's code, replaced by a
12-byte contract that returns the GMX ticker prices unsigned (it stands in for the Chainlink
Data Streams signature check). GMX's own `DepositHandler.simulateExecuteDeposit`, which uses no
mock and reverts `EndOfOracleSimulation` only after a complete execution, agreed with every row.

### Real builder output

`examples/gmx-v2-deposit-fork-replay.ts` builds the plan with the live Reader and oracle (and
live LI.FI for USDT), merges approvals as plan-orchestration does, and runs both keeper paths.
Every run below succeeded: all batch calls succeeded, both GMX simulations ended in
`EndOfOracleSimulation`, and the keeper minted at least `minMarketTokens` on every deposit.

| Funding (per market)                     | Markets                | Swap paths                     |
| ---------------------------------------- | ---------------------- | ------------------------------ |
| 53200 USDC ($0.0532), 100 USDC, 10k USDC | `btc-btc`, `eth-eth`   | `[btc-usdc]`, `[eth-usdc]`     |
| 0.00002 ETH, 0.05 ETH, 0.00002 WETH      | `btc-btc`, `eth-eth`   | `[eth-usdc, btc-usdc]`, direct |
| 53200 USDT (LI.FI to USDC first)         | `btc-btc`, `eth-eth`   | `[btc-usdc]`, `[eth-usdc]`     |
| 53200 USDC / USDT                        | `btc-usdc`, `eth-usdc` | direct                         |
| 0.00002 ETH                              | `btc-usdc`, `eth-usdc` | `[eth-usdc]` into USDC, direct |

### Routing and USDT

`GMX_V2_SWAP_PATHS` holds the verified hops: USDC→WBTC.b via `btc-usdc`, USDC→WETH via
`eth-usdc`, WETH→USDC via `eth-usdc`, WETH→WBTC.b via `eth-usdc` then `btc-usdc`. The builder
takes a direct side when the funding token is a pool token, otherwise the fewest hops (the
long side on a tie). USDT has no path: GMX's only USDT market (swap-only USDC/USDT,
`0xB686BcB1…c4`) held 2,806 USDC against 23,059 USDT, so USDT→USDC through it cost ~0.09% up to
$2.5k and reverted at $5k. USDT is converted to USDC through LI.FI first (Gate 2's guard still
covers that leg), then follows the USDC path.

### Cost against LI.FI

Reader quote vs a LI.FI quote (slippage 0.5%), both against the GMX oracle mid price:

| Swap          | $100             | $10k             | $100k            |
| ------------- | ---------------- | ---------------- | ---------------- |
| USDC → WBTC.b | 0.141% vs 0.229% | 0.142% vs 0.241% | 0.157% vs 0.282% |
| USDC → WETH   | 0.146% vs 0.273% | 0.147% vs 0.276% | 0.158% vs 0.275% |

### Capacity and keeper fee

- Pool headroom on 2026-09-25: `btc-usdc` USDC 31.1M of a 110M cap, `eth-usdc` USDC 26.4M of
  100M, `btc-btc` 121 of 1,500 WBTC.b, `eth-eth` 7,041 of 12,000 WETH. A capped hop pool makes
  the keeper cancel the deposit and refund the initial token; funds are not lost.
- One 0.001 ETH keeper fee per deposit still covers the path. `GasUtils` estimates
  `DEPOSIT_GAS_LIMIT` (2.05M) plus `SINGLE_SWAP_GAS_LIMIT` (1M) per hop, adjusted to 3.18M,
  4.51M, and 5.85M gas for 0, 1, and 2 hops; at the observed 0.02 gwei that needs
  0.00006–0.00012 ETH, and 0.001 ETH covers up to 0.17 gwei with two hops. The
  `createDeposit` multicall used at most 0.89M of its 1.2M gas limit.

### Reproduce

```bash
pnpm --filter @zapengine/intent-engine exec tsx examples/gmx-v2-deposit-fork-replay.ts
```

Set `REPLAY_TOKEN` (USDC, USDT, ETH, WETH), `REPLAY_AMOUNT`, `REPLAY_MARKETS`, or
`REPLAY_RPC_URL` (any Arbitrum RPC serving `eth_simulateV1`) to vary the run.
