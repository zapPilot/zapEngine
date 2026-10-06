import { equalsAddress, isWalletAddress } from '@zapengine/types/shared';

export function classifyWalletSearch(
  input: string,
  ownAddresses: readonly string[],
): 'empty' | 'invalid' | 'own' | 'lookup' {
  const address = input.trim();
  if (!address) return 'empty';
  if (!isWalletAddress(address)) return 'invalid';
  return ownAddresses.some((own) => equalsAddress(own, address))
    ? 'own'
    : 'lookup';
}
