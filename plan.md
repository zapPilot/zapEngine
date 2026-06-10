# Privy EOA EIP-7702 Atomic Batch Migration Plan with Tenderly Preflight

## Goal

Migrate the normal Base Morpho invest flow away from ZeroDev ERC-4337/UserOp execution and into Privy EOA EIP-7702 atomic batching.

Target architecture:

Privy embedded EOA
-> backend builds validated atomic call batch
-> Tenderly preflight simulation
-> Privy Wallets SDK/API `wallet_sendCalls`
-> EIP-7702 atomic `approve + supply`
-> status tracking via Privy transaction id

The normal flow must not use ZeroDev, KernelClient, bundler, paymaster, `sendUserOperation`, or UserOp nonce handling.

## Why

The previous ZeroDev path produced AA25 / UserOp nonce errors. That error category only exists because the app was using ERC-4337/UserOp infrastructure.

For this product direction, the default invest path should be EOA-first:

* same Privy embedded wallet address
* same-chain atomic batch
* user pays gas normally
* no gas sponsorship in v1
* no bundler/paymaster/UserOp dependency

Privy supports EVM atomic batching through `wallet_sendCalls`, but our previous implementation sent `wallet_sendCalls` to the wrong surface: Privy chain RPC / Alchemy-style RPC. The correct surface is Privy Wallets SDK/API, not the normal chain RPC.

## Non-goals

Do not implement:

* ZeroDev fallback
* gas sponsorship
* session keys
* ERC-4337 automation
* paymaster routing
* automatic UserOp gas bumping
* AA25 nonce lock as part of the normal path

These can be reconsidered later as a separate AA automation module.

## Phase 1 — Remove ZeroDev from frontend execution

Remove all ZeroDev usage from the normal invest execution path.

Delete or isolate:

* `@zerodev/*` frontend dependencies if no longer referenced
* `ZERODEV_*` frontend env requirements
* `KernelClient`
* `createKernelAccount`
* `bundlerTransport`
* `paymaster`
* `sendUserOperation`
* `waitForUserOperationReceipt`
* AA25/UserOp nonce lock logic from normal path
* ZeroDev RPC chain segment logging
* any fallback from Privy sendCalls to ZeroDev UserOp

After this phase, the normal Base Morpho invest flow must run without any ZeroDev env vars.

## Phase 2 — Introduce backend Privy batch execution endpoint

Do not call Privy Wallets REST API directly from the browser if it requires server credentials or authorization signatures that should not be exposed.

Add a backend endpoint such as:

`POST /api/wallets/privy/send-atomic-batch`

Request body:

* `walletId`
* `walletAddress`
* `chainId`
* `intentType`
* `calls`
* `simulationRequired: true`

For Base Morpho invest, `chainId` must be `8453`.

The backend should:

1. Validate the user/session owns the requested Privy wallet.
2. Validate `walletAddress` matches the Privy wallet.
3. Validate all calls are same-chain.
4. Validate all target addresses are allowlisted for the selected strategy.
5. Run Tenderly preflight simulation.
6. If simulation passes, call Privy Wallets SDK/API `wallet_sendCalls`.
7. Return Privy `transaction_id`, `caip2`, simulation summary, and execution metadata.

Do not use:

* viem `http(privyChainRpc).sendCalls`
* `wallet_sendCalls` against `*.rpc.privy.systems`
* Alchemy/Base/Arbitrum normal RPC as the wallet_sendCalls endpoint

Correct Privy call shape:

```ts
await privy.wallets().ethereum().sendCalls(walletId, {
  caip2: 'eip155:8453',
  params: {
    calls: [
      { to: usdcAddress, data: approveData, value: '0x0' },
      { to: morphoVaultAddress, data: supplyData, value: '0x0' }
    ]
  }
});
```

Or equivalent REST call:

```json
{
  "method": "wallet_sendCalls",
  "caip2": "eip155:8453",
  "chain_type": "ethereum",
  "params": {
    "calls": [
      {
        "to": "0xUSDC",
        "data": "0x...",
        "value": "0x0"
      },
      {
        "to": "0xMorphoVault",
        "data": "0x...",
        "value": "0x0"
      }
    ]
  }
}
```

## Phase 3 — Add Tenderly preflight simulation

Add a backend `simulateAtomicBatch` service.

Input:

* `chainId`
* `from`
* `calls`
* optional block tag
* strategy metadata

For Base Morpho invest, Tenderly simulation should check:

* wallet has enough USDC
* wallet has enough native ETH for gas, if gas is not sponsored
* `approve(spender, amount)` does not revert
* `supply(amount, receiver)` does not revert
* receiver is the Privy wallet address
* allowance after approval is sufficient
* expected vault shares / supply side effects are reasonable
* no unexpected token drain
* no call targets outside allowlist
* decoded trace does not include unknown protocol targets, unless explicitly expected

Important limitation:
Tenderly preflight may not perfectly simulate Privy’s final EIP-7702 outer transaction unless we can obtain the exact outer `self.execute` transaction calldata from Privy before broadcast.

Therefore implement Tenderly in two levels:

### Level A — Inner-call preflight, required for v1

Simulate the inner calls in order:

1. `USDC.approve(morphoVault, amount)`
2. `MorphoVault.supply(amount, walletAddress)`

This catches most real user failures:

* insufficient balance
* wrong spender
* wrong calldata
* vault revert
* paused market
* cap reached
* bad receiver
* bad amount
* wrong chain
* wrong token decimals

If the Tenderly bundle or sequential simulation fails, block execution and show a readable error.

### Level B — Exact 7702 envelope simulation, optional follow-up

If Privy exposes or can return the final unsigned/signed outer tx before broadcast, simulate that exact transaction:

* `from = walletAddress`
* `to = walletAddress` or Kernel/delegation target, depending on Privy execution shape
* `data = self.execute(...)`
* `chainId = 8453`
* current block state

Only claim “exact Privy 7702 simulation” after we are simulating the same outer transaction that Privy will broadcast.

Until then, call the feature “Tenderly preflight simulation,” not “exact 7702 simulation.”

## Phase 4 — Frontend execution flow

Frontend flow:

1. User clicks Invest.
2. Build invest intent.
3. Fetch deposit plan.
4. Encode calls:

   * call 1: USDC approve
   * call 2: Morpho supply/deposit
5. Send calls to backend `/api/wallets/privy/send-atomic-batch`.
6. Backend runs Tenderly preflight.
7. If simulation fails:

   * show decoded Tenderly failure reason
   * do not call Privy
8. If simulation passes:

   * backend calls Privy `wallet_sendCalls`
   * frontend receives `transaction_id`
9. Frontend polls status using Privy transaction tracking or backend wrapper.
10. Show final result.

No ZeroDev fallback.

## Phase 5 — Error handling

Normalize errors into categories:

### Simulation failure

User-facing message:
“Preflight simulation failed. No transaction was sent.”

Include:

* failing call index
* decoded function name
* revert reason, if available
* target address
* amount
* chainId

### Privy wallet_sendCalls unsupported / wrong surface

User-facing message:
“Privy atomic batch request failed before broadcast. This should use Privy Wallets API, not chain RPC.”

Developer log:

* endpoint used
* method
* caip2
* walletId
* chainId
* call count

### Chain mismatch

Block immediately if:

* selected chain is not Base
* provider RPC is Arbitrum but request chainId is Base
* caip2 is not `eip155:8453`

### User rejected

User-facing message:
“Transaction was rejected by the wallet.”

### Onchain revert after broadcast

User-facing message:
“Atomic batch reverted onchain. No partial action was applied.”

Include:

* transaction hash if available
* Privy transaction id
* decoded receipt status
* Tenderly debug link, if generated

### Legacy AA25

AA25 should not be reachable from the normal path.

If AA25 appears:

* mark it as architecture regression
* log “Unexpected ZeroDev/UserOp path reached”
* fail loudly in development

## Phase 6 — Logging

Replace old `gmxDeposit` debug summary with generic structured logging.

Use:

```ts
atomicBatch: {
  provider: 'privy',
  executionMode: 'eip7702_wallet_sendCalls',
  chainId: 8453,
  caip2: 'eip155:8453',
  walletId,
  walletAddress,
  transactionCount: calls.length,
  calls: [
    {
      index,
      to,
      value,
      intentType,
      functionName,
      dataLength
    }
  ],
  tenderly: {
    enabled: true,
    simulationId,
    status,
    gasUsed,
    failedCallIndex,
    decodedError
  },
  privy: {
    transactionId,
    sponsor: false
  }
}
```

Do not log:

* private keys
* auth signatures
* Privy API secrets
* full authorization headers
* user PII

## Phase 7 — Tests

### Unit tests

Add or update:

`useInvestStrategy.test.ts`

* normal invest path calls backend Privy atomic batch endpoint
* does not call ZeroDev
* duplicate click dedupes promise
* simulation failure does not call Privy execution

`usePrivyWalletBackend.test.tsx` or renamed backend client test

* no `sendUserOperation`
* no `KernelClient`
* no `wallet_sendCalls` sent to normal chain RPC
* sends request to backend Privy batch endpoint
* handles Privy `transaction_id`

`simulateAtomicBatch.test.ts`

* simulates approve + supply
* blocks insufficient USDC
* blocks wrong receiver
* blocks wrong chain
* blocks unallowlisted target
* returns decoded revert reason when available

### Integration tests

Add Base Morpho happy path with mocked Tenderly + mocked Privy:

* Tenderly success -> Privy sendCalls called
* Tenderly failure -> Privy sendCalls not called
* Privy success -> frontend shows pending transaction id
* Privy failure -> frontend shows normalized error

### Regression tests

Assert the frontend bundle no longer imports:

* `@zerodev/*`
* `sendUserOperation`
* `KernelClient`
* `bundlerTransport`
* `paymaster`

Run:

```bash
pnpm --dir apps/frontend exec vitest run \
  tests/unit/hooks/useInvestStrategy.test.ts \
  tests/unit/hooks/useGmxDeposit.test.ts \
  tests/unit/hooks/useWithdraw.test.ts \
  tests/unit/hooks/wallet/usePrivyWalletBackend.test.tsx
```

```bash
pnpm turbo run test --filter=@zapengine/frontend
pnpm turbo run type-check --filter=@zapengine/frontend
```

Add backend tests if the Privy/Tenderly execution endpoint lives outside frontend.

## Phase 8 — Environment variables

Remove from frontend:

* `VITE_ZERODEV_*`
* any client-exposed ZeroDev RPC values

Add backend-only env:

* `PRIVY_APP_ID`
* `PRIVY_APP_SECRET` or required Privy API credentials
* `TENDERLY_ACCOUNT`
* `TENDERLY_PROJECT`
* `TENDERLY_ACCESS_KEY`
* `TENDERLY_BASE_RPC_URL` or equivalent Tenderly RPC endpoint

Frontend may only receive:

* public app id if already required
* non-secret feature flags
* non-secret chain config

## Phase 9 — Acceptance criteria

This migration is complete only when:

1. Base Morpho invest works through Privy `wallet_sendCalls`.
2. The browser no longer sends `wallet_sendCalls` to `*.rpc.privy.systems`.
3. Normal invest flow works without ZeroDev env vars.
4. No `sendUserOperation` is called in normal invest.
5. No AA25 can occur in normal invest.
6. Tenderly preflight runs before Privy execution.
7. Failed Tenderly simulation blocks the transaction before wallet execution.
8. Successful Privy execution returns `transaction_id`.
9. UI can track pending/success/failed status.
10. Logs clearly show:

    * chainId
    * wallet address
    * call count
    * Tenderly simulation result
    * Privy transaction id
    * no `gmxDeposit` naming for Morpho
11. There is no fallback to ZeroDev.
12. Chain mismatch such as Arbitrum RPC + Base chainId is impossible or blocked.

## Phase 10 — Rollout

Behind feature flag:

`VITE_PRIVY_SEND_CALLS_ENABLED=true`

Rollout order:

1. Local with mocked Privy/Tenderly.
2. Local Base mainnet small USDC amount.
3. Staging with real Tenderly simulation and real Privy execution.
4. Production hidden debug panel.
5. Production normal users.

Start with very small amount, for example 0.01–1 USDC, until logs confirm:

* Tenderly simulation success
* Privy transaction id returned
* onchain receipt confirmed
* Morpho supply state updated
* no partial side effects

## Final instruction

Do not present this as a ZeroDev AA25 fix.

This is an execution architecture migration:
from ZeroDev ERC-4337/UserOp
to Privy EOA EIP-7702 `wallet_sendCalls`
with Tenderly preflight simulation.

