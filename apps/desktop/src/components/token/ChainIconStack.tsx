import { CHAIN_ICON_SRC_BY_CHAIN } from '@/data/assetIcons';
import { type ChainKey, CHAINS } from '@/data/demo';

interface ChainIconStackProps {
  chains: ChainKey[];
  size?: number;
}

/** Overlapping chain dots — the design surfaces chains only as small icons. */
export function ChainIconStack({ chains, size = 14 }: ChainIconStackProps) {
  return (
    <span className="flex items-center">
      {chains.map((chain, index) => (
        <span
          key={chain}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            background: CHAINS[chain].color,
            backgroundImage: `url(${CHAIN_ICON_SRC_BY_CHAIN[chain]})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            border: '1.5px solid #0a0a0a',
            marginLeft: index === 0 ? 0 : -5,
          }}
        />
      ))}
    </span>
  );
}
