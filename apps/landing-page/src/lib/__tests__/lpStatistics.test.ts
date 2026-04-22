import { STATISTICS } from '../statistics';

describe('statistics', () => {
  describe('STATISTICS', () => {
    it('should include the hero text stats', () => {
      expect(STATISTICS).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Total Value Locked',
            value: '$261k+',
            type: 'text',
          }),
          expect.objectContaining({
            label: 'Market Regimes Monitored',
            value: '5',
            type: 'text',
          }),
        ]),
      );
    });

    it('should include the core asset icons', () => {
      const coreAssetsStat = STATISTICS.find(
        (stat) => stat.label === 'Core Assets',
      );

      expect(coreAssetsStat).toBeDefined();
      expect(coreAssetsStat?.type).toBe('icons');
      expect(coreAssetsStat?.icons?.map((icon) => icon.name)).toEqual([
        'BTC',
        'ETH',
        'USDC',
      ]);
      expect(coreAssetsStat?.icons?.map((icon) => icon.src)).toEqual([
        '/btc.webp',
        '/eth.webp',
        '/usdc.webp',
      ]);
    });

    it('should include the integrated protocol icons', () => {
      const protocolsStat = STATISTICS.find(
        (stat) => stat.label === 'Integrated Protocols',
      );

      expect(protocolsStat).toBeDefined();
      expect(protocolsStat?.type).toBe('icons');
      expect(protocolsStat?.icons?.map((icon) => icon.name)).toEqual([
        'Morpho',
        'GMX',
        'Hyperliquid',
        'Aster',
      ]);
    });
  });
});
