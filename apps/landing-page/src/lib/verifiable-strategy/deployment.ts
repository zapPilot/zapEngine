import {
  createWalletClient,
  custom,
  getContractAddress,
  keccak256,
  toHex,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { STRATEGY_CHAIN } from '@/config/verifiable-strategy';
import artifact from '@/data/strategy-deployment.json';
import { calculatorClient } from './onchain';
import type { Deployment } from './types';

export const FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const;
const FACTORY_CODE =
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';
export const SALT = keccak256(
  toHex('zap-pilot/research/dma-cross-down-slice/v1'),
);
export const DEPLOYMENT_ADDRESS = getContractAddress({
  opcode: 'CREATE2',
  from: FACTORY,
  salt: SALT,
  bytecode: artifact.initcode as Hex,
});

// Wallets may wrap a missing-chain error in an internal RPC error.
function isUnknownChain(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const detail = current as {
      code?: number;
      message?: string;
      cause?: unknown;
    };
    if (detail.code === 4001) return false;
    if (
      detail.code === 4902 ||
      detail.message
        ?.toLowerCase()
        .includes(`unrecognized chain id "${toHex(STRATEGY_CHAIN.id)}"`)
    )
      return true;
    current = detail.cause;
  }
  return false;
}

export async function deployStrategy(
  provider: EIP1193Provider,
  onTransaction: (hash: Hex) => void,
): Promise<Deployment> {
  const wallet = createWalletClient({
    chain: STRATEGY_CHAIN,
    transport: custom(provider),
  });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('Select an account in Rabby');
  try {
    await wallet.switchChain({ id: STRATEGY_CHAIN.id });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    await wallet.addChain({ chain: STRATEGY_CHAIN });
    await wallet.switchChain({ id: STRATEGY_CHAIN.id });
  }
  if ((await wallet.getChainId()) !== STRATEGY_CHAIN.id)
    throw new Error('Arbitrum Sepolia required');
  const client = calculatorClient();
  if ((await client.getChainId()) !== STRATEGY_CHAIN.id)
    throw new Error('Wrong RPC network');
  if (
    (await client.getBytecode({ address: FACTORY }))?.toLowerCase() !==
    FACTORY_CODE
  )
    throw new Error('Deterministic deployer bytecode mismatch');
  const existing = await client.getBytecode({ address: DEPLOYMENT_ADDRESS });
  if (existing && existing !== '0x')
    throw new Error(
      'Already deployed. Resume using the deployment transaction hash and the verification command.',
    );
  const hash = await wallet.sendTransaction({
    account,
    to: FACTORY,
    data: `${SALT}${artifact.initcode.slice(2)}`,
    value: 0n,
  });
  onTransaction(hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Deployment reverted');
  const code = await client.getBytecode({ address: DEPLOYMENT_ADDRESS });
  if (!code || keccak256(code) !== artifact.runtimeCodehash)
    throw new Error('Runtime codehash mismatch');
  return {
    chainId: STRATEGY_CHAIN.id,
    address: DEPLOYMENT_ADDRESS,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    runtimeCodehash: artifact.runtimeCodehash as Hex,
    sourcify: { status: 'pending' },
  };
}
