import type { PermitRequest, PreparedTransaction } from '@zapengine/types/api';
import {
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import { encodeMulticall3 } from './multicall3.executor.js';

const PERMIT_ABI = [
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'version',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export interface BuildPermitTypedDataInput {
  token: Address;
  owner: Address;
  spender: Address;
  value: string;
  deadline: string;
  publicClient: PublicClient;
}

export type SignedPermit = PermitRequest & {
  signature: Hex;
};

function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    throw new Error('Expected a 65-byte ECDSA signature');
  }

  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const recoveryByte = Number.parseInt(signature.slice(130, 132), 16);
  const v = recoveryByte < 27 ? recoveryByte + 27 : recoveryByte;

  return { v, r, s };
}

export async function buildPermitTypedData({
  token,
  owner,
  spender,
  value,
  deadline,
  publicClient,
}: BuildPermitTypedDataInput): Promise<PermitRequest> {
  const [name, version, nonce] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: PERMIT_ABI,
      functionName: 'name',
    }),
    publicClient.readContract({
      address: token,
      abi: PERMIT_ABI,
      functionName: 'version',
    }),
    publicClient.readContract({
      address: token,
      abi: PERMIT_ABI,
      functionName: 'nonces',
      args: [owner],
    }),
  ]);

  const nonceString = (nonce as bigint).toString();

  return {
    token,
    owner,
    spender,
    value,
    nonce: nonceString,
    deadline,
    typedData: {
      domain: {
        name: name as string,
        version: version as string,
        chainId: publicClient.chain?.id ?? 8453,
        verifyingContract: token,
      },
      types: PERMIT_TYPES,
      primaryType: 'Permit',
      message: {
        owner,
        spender,
        value,
        nonce: nonceString,
        deadline,
      },
    },
  };
}

export function encodePermitCall(
  token: Address,
  permit: SignedPermit,
): PreparedTransaction {
  const { v, r, s } = splitSignature(permit.signature);

  return {
    to: token,
    data: encodeFunctionData({
      abi: PERMIT_ABI,
      functionName: 'permit',
      args: [
        permit.owner as Address,
        permit.spender as Address,
        BigInt(permit.value),
        BigInt(permit.deadline),
        v,
        r,
        s,
      ],
    }),
    value: '0',
    chainId: permit.typedData.domain.chainId,
    meta: {
      intentType: 'ERC20_PERMIT',
    },
  };
}

export function wrapPermitAndCallsInMulticall3(
  permitTx: PreparedTransaction,
  calls: PreparedTransaction[],
): PreparedTransaction {
  return encodeMulticall3([permitTx, ...calls]);
}
