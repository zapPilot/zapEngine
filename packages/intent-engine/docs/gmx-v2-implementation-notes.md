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
token to the receiver — that settlement is **not** reproducible on a fork. The verification
bar is therefore: swap delivers collateral + `ExchangeRouter.multicall` submits without
revert.

### Reproduce

`examples/gmx-v2-btc-btc-verify.ts` (env `VERIFY_MARKET=btc-btc|eth-eth|btc-usdc|eth-usdc`)
prints the real plan calldata. Replay the GMX `multicall` element on a Tenderly Arbitrum fork
after seeding the EOA with collateral (`set_erc20_balance`), a `collateral→router` approval,
and ~`0.001` ETH for `sendWnt`.

## Gate 2 - Dust deposits revert the swap (zero slippage buffer)

Date: 2026-06-03

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
