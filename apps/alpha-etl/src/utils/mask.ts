import { shortenAddress } from '@zapengine/types/shared';

export function maskWalletAddress(address: string | null | undefined): string {
  if (typeof address !== 'string') {
    return '';
  }
  return shortenAddress(address);
}
