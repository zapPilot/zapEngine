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
