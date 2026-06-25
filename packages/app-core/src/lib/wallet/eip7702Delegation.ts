import { type Address, getAddress, type Hex } from 'viem';

import { getPublicClient } from '@core/services/intentClient';

const EIP7702_DELEGATION_PREFIX = '0xef0100';
const EIP7702_IMPLEMENTATION_HEX_LENGTH = 40;

export const EIP7702_DELEGATES = {
  ambire: getAddress('0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d'),
  okx: getAddress('0x80296FF8D1ED46f8e3C7992664D13B833504c2Bb'),
  metamask: getAddress('0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'),
} as const;

export type EIP7702DelegationCompatibility =
  | 'none'
  | 'supported'
  | 'unsupported'
  | 'unknown';

export type EIP7702DelegationInspection =
  | {
      kind: 'notDelegated';
      compatibility: 'none';
    }
  | {
      kind: 'delegated';
      implementation: Address;
      label: string;
      compatibility: Exclude<EIP7702DelegationCompatibility, 'none'>;
    };

interface InspectDelegationInput {
  address: Address;
  chainId: number;
}

const DELEGATE_METADATA: Record<
  string,
  {
    label: string;
    compatibility: Exclude<EIP7702DelegationCompatibility, 'none'>;
  }
> = {
  [EIP7702_DELEGATES.ambire.toLowerCase()]: {
    label: 'Ambire EIP-7702 Delegator',
    compatibility: 'supported',
  },
  [EIP7702_DELEGATES.okx.toLowerCase()]: {
    label: 'OKX EIP-7702 Delegator',
    compatibility: 'supported',
  },
  [EIP7702_DELEGATES.metamask.toLowerCase()]: {
    label: 'MetaMask EIP-7702 Delegator',
    compatibility: 'unsupported',
  },
};

function parseDelegatedImplementation(code: Hex | undefined): Address | null {
  if (!code) {
    return null;
  }

  const normalizedCode = code.toLowerCase();
  if (!normalizedCode.startsWith(EIP7702_DELEGATION_PREFIX)) {
    return null;
  }

  const implementationHex = normalizedCode.slice(
    EIP7702_DELEGATION_PREFIX.length,
    EIP7702_DELEGATION_PREFIX.length + EIP7702_IMPLEMENTATION_HEX_LENGTH,
  );
  if (
    implementationHex.length !== EIP7702_IMPLEMENTATION_HEX_LENGTH ||
    !/^[0-9a-f]{40}$/.test(implementationHex)
  ) {
    return null;
  }

  return getAddress(`0x${implementationHex}`);
}

export async function inspectDelegation({
  address,
  chainId,
}: InspectDelegationInput): Promise<EIP7702DelegationInspection> {
  const code = await getPublicClient(chainId).getCode({ address });
  const implementation = parseDelegatedImplementation(code);
  if (!implementation) {
    return {
      kind: 'notDelegated',
      compatibility: 'none',
    };
  }

  const metadata = DELEGATE_METADATA[implementation.toLowerCase()];
  if (!metadata) {
    return {
      kind: 'delegated',
      implementation,
      label: 'Unknown EIP-7702 implementation',
      compatibility: 'unknown',
    };
  }

  return {
    kind: 'delegated',
    implementation,
    label: metadata.label,
    compatibility: metadata.compatibility,
  };
}
