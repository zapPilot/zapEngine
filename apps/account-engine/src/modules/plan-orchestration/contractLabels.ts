import { GMX_V2_ADDRESSES } from '@zapengine/intent-engine';
import type { ExecutionSimulationContract } from '@zapengine/types/api';

/**
 * Display names for the routing contracts a plan calls directly. Tokens and
 * ERC-4626 vaults already name themselves through the on-chain token metadata
 * Tenderly returns, so only infrastructure that mints nothing to the wallet
 * needs a label here.
 */
const PROTOCOL_CONTRACT_NAMES = new Map<string, string>([
  [GMX_V2_ADDRESSES.exchangeRouter.toLowerCase(), 'GMX Exchange Router'],
  // LI.FI's diamond is the target of every swap and bridge call it routes. It
  // is absent from the protocol registries because production reads it off the
  // LI.FI quote rather than a constant; a future address simply falls back to
  // the raw address instead of being mislabelled.
  ['0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', 'LI.FI Diamond'],
]);

/** Names the contracts Tenderly could not name, leaving existing names intact. */
export function withProtocolContractNames(
  contracts: readonly ExecutionSimulationContract[],
): ExecutionSimulationContract[] {
  return contracts.map((contract) =>
    contract.name
      ? contract
      : {
          ...contract,
          name:
            PROTOCOL_CONTRACT_NAMES.get(contract.address.toLowerCase()) ?? null,
        },
  );
}
