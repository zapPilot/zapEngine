# @zapengine/intent-engine

DeFi intent routing and execution logic for Zap Pilot.

## Overview

TypeScript library for constructing and validating DeFi transaction intents:

- **Route optimization**: Finds optimal paths across DEXs and protocols via LI.FI
- **Intent validation**: Zod schemas for transaction safety
- **Protocol adapters**: Morpho vaults and other integrated protocols
- **EIP-7702 execution**: Batch transaction execution with EIP-7702 authorization

## Usage

```typescript
import { createIntentEngine, validateIntent } from '@zapengine/intent-engine';
import { MORPHO_VAULTS } from '@zapengine/intent-engine/morpho';

const engine = createIntentEngine({
  lifi: { integrator: 'my-app' },
});
```

## Factory Function

### `createIntentEngine(config)`

Creates an `IntentEngine` instance configured for intent building and execution.

**Parameters:**

```typescript
interface IntentEngineConfig {
  /** LI.FI adapter configuration */
  lifi: LiFiAdapterConfig;
  /** Optional simulation adapter (defaults to NoopSimulationAdapter) */
  simulation?: SimulationAdapter;
}
```

**IntentEngine interface:**

| Method                                    | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| `buildSwap(intent)`                       | Build a swap transaction via LI.FI         |
| `buildSupply(intent, publicClient)`       | Build a supply (deposit) transaction       |
| `buildWithdraw(intent)`                   | Build a withdraw transaction               |
| `buildRotate(intent, publicClient)`       | Build a rotate transaction plan            |
| `simulateTx(tx)`                          | Simulate a transaction before execution    |
| `getExecutionStrategy(wallet?, chainId?)` | Determine best execution strategy          |
| `batchTransactions(txs)`                  | Batch transactions for atomic execution    |
| `executeWithEIP7702(txs, wallet)`         | Execute batched transactions with EIP-7702 |

## Exports

### Core

| Export               | Description                                |
| -------------------- | ------------------------------------------ |
| `createIntentEngine` | Factory function to create an IntentEngine |
| `IntentEngine`       | The engine interface                       |
| `IntentEngineConfig` | Configuration interface                    |

### Validators

| Export                   | Description              |
| ------------------------ | ------------------------ |
| `validateIntent`         | Validate any intent      |
| `validateSwapIntent`     | Validate swap intent     |
| `validateSupplyIntent`   | Validate supply intent   |
| `validateWithdrawIntent` | Validate withdraw intent |
| `validateRotateIntent`   | Validate rotate intent   |

### Builders

| Export            | Description                |
| ----------------- | -------------------------- |
| `buildSwapTx`     | Build swap transaction     |
| `buildSupplyTx`   | Build supply transaction   |
| `buildWithdrawTx` | Build withdraw transaction |
| `buildRotateTx`   | Build rotate transaction   |

### Adapters

| Export                      | Description                               |
| --------------------------- | ----------------------------------------- |
| `LiFiAdapter`               | LI.FI integration adapter                 |
| `LiFiAdapterConfig`         | LI.FI adapter configuration               |
| `SimulationAdapter`         | Simulation interface                      |
| `TenderlySimulationAdapter` | Tenderly simulation for pre-flight checks |
| `NoopSimulationAdapter`     | Default no-op simulation (passthrough)    |
| `TenderlyConfig`            | Tenderly configuration                    |

### Execution (EIP-7702)

| Export                       | Description                                |
| ---------------------------- | ------------------------------------------ |
| `detectEIP7702Support`       | Check if wallet/network supports EIP-7702  |
| `determineExecutionStrategy` | Determine best execution approach          |
| `ExecutionStrategy`          | Execution strategy type                    |
| `encodeMulticall3`           | Encode transactions for multicall3         |
| `executeWithEIP7702`         | Execute transactions with EIP-7702         |
| `waitForEIP7702Confirmation` | Wait for EIP-7702 transaction confirmation |

### Protocol Constants

| Export                     | Description                         |
| -------------------------- | ----------------------------------- |
| `DEFAULT_VAULT_REGISTRY`   | Default Morpho vault registry       |
| `MORPHO_VAULTS`            | Morpho vault addresses              |
| `MORPHO_VAULT_CATALOG`     | Morpho vault metadata catalog       |
| `MORPHO_VAULT_ABI`         | Morpho vault ABI                    |
| `MORPHO_GAS_ESTIMATES`     | Gas estimates for Morpho operations |
| `ProtocolCapabilitySchema` | Schema for protocol capabilities    |
| `ProtocolIdSchema`         | Schema for protocol IDs             |
| `VaultMetaSchema`          | Schema for vault metadata           |

### Errors

| Export                     | Description                  |
| -------------------------- | ---------------------------- |
| `IntentEngineError`        | Base error class             |
| `ValidationError`          | Intent validation failed     |
| `QuoteError`               | Failed to get quote          |
| `InsufficientBalanceError` | Insufficient balance         |
| `SlippageError`            | Slippage exceeded tolerance  |
| `UnsupportedChainError`    | Chain not supported          |
| `UnsupportedTokenError`    | Token not supported on chain |
| `ExecutionError`           | Transaction execution failed |
| `SimulationFailedError`    | Simulation failed            |

### Subpaths

| Path                              | Description                 |
| --------------------------------- | --------------------------- |
| `@zapengine/intent-engine`        | Core routing and validation |
| `@zapengine/intent-engine/types`  | Type definitions            |
| `@zapengine/intent-engine/morpho` | Morpho protocol adapter     |

## Build

```bash
pnpm build
```

See [CLAUDE.md](../../../CLAUDE.md) for monorepo development guidelines.
