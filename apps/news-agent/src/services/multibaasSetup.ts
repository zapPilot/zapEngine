import { erc20Abi, erc4626Abi } from 'viem';

import type { Multibaas } from '../lib/multibaas.js';
import { ETH_VAULT, USDC, USDC_VAULT, WETH } from './demoRule.js';

// MultiBaas's built-in erc20interface rescales amounts by decimals(), which
// would change calldata; raw ABIs keep composed bytes identical to the plan.
const CONTRACTS = [
  {
    alias: 'weth',
    target: WETH,
    contract: {
      label: 'wethtoken',
      contractName: 'WETHToken',
      rawAbi: JSON.stringify(erc20Abi),
    },
  },
  {
    alias: 'clearstarethvault',
    target: ETH_VAULT,
    contract: {
      label: 'clearstarethvault',
      contractName: 'ClearstarCoreETHVault',
      rawAbi: JSON.stringify(erc4626Abi),
    },
  },
  {
    alias: 'usdc',
    target: USDC,
    contract: {
      label: 'usdctoken',
      contractName: 'USDCToken',
      rawAbi: JSON.stringify(erc20Abi),
    },
  },
  {
    alias: 'sparkusdcvault',
    target: USDC_VAULT,
    contract: {
      label: 'sparkusdcvault',
      contractName: 'SparkUSDCVault',
      rawAbi: JSON.stringify(erc4626Abi),
    },
  },
] as const;
const label = (index: number) => ({
  alias: CONTRACTS[index]!.alias,
  contract: CONTRACTS[index]!.contract.label,
});
export const LABELS = {
  weth: label(0),
  ethVault: label(1),
  usdc: label(2),
  usdcVault: label(3),
} as const;
export const DEPOSIT_EVENT = 'Deposit(address,address,uint256,uint256)';
const VERSION = '1.0';

// Idempotent: re-running only fills in whatever registration is missing.
export async function multibaasSetup(
  multibaas: Multibaas,
  log: (line: string) => void,
): Promise<void> {
  const { blockNumber } = await multibaas.status();
  const uploaded = new Set((await multibaas.contracts()).map((c) => c.label));
  for (const { alias, target, contract } of CONTRACTS) {
    if (!uploaded.has(contract.label)) {
      // MultiBaas requires bytecode even for interface-only uploads.
      await multibaas.createContract({
        ...contract,
        version: VERSION,
        bin: '',
      });
      log(`Uploaded contract ${contract.label} (viem ABI)`);
    }
    const existing = await multibaas.address(alias);
    if (existing && existing.address.toLowerCase() !== target.toLowerCase())
      throw new Error(`Alias ${alias} already points at ${existing.address}`);
    if (!existing) {
      await multibaas.createAddress(alias, target);
      log(`Aliased ${alias} → ${target}`);
    }
    if (!existing?.contracts?.some((c) => c.label === contract.label)) {
      await multibaas.linkContract(alias, {
        label: contract.label,
        version: VERSION,
        startingBlock: String(blockNumber),
      });
      log(
        `Linked ${alias} to ${contract.label}, indexing from block ${blockNumber}`,
      );
    }
  }
  log('MultiBaas setup complete');
}
