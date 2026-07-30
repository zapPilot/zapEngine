import { describe, expect, it } from 'vitest';
import { IPFS_GATEWAYS, ipfsGatewayUrl } from '../track-record';

describe('ipfsGatewayUrl', () => {
  it('appends the CID without duplicating the gateway path segment', () => {
    expect(ipfsGatewayUrl('https://ipfs.io/ipfs', 'bafkreiabc')).toBe(
      'https://ipfs.io/ipfs/bafkreiabc',
    );
  });

  it('collapses a trailing slash on the gateway', () => {
    expect(ipfsGatewayUrl('https://ipfs.io/ipfs/', 'bafkreiabc')).toBe(
      'https://ipfs.io/ipfs/bafkreiabc',
    );
  });

  it('produces exactly one /ipfs/ segment for every configured gateway', () => {
    for (const gateway of IPFS_GATEWAYS) {
      const url = ipfsGatewayUrl(gateway, 'bafkreiabc');
      expect(url.match(/\/ipfs\//g)).toHaveLength(1);
      expect(url.endsWith('/bafkreiabc')).toBe(true);
    }
  });
});
