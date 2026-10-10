import {
  ASSET_GLYPH_PATHS as paths,
  type Sleeve,
} from '../model/asset-glyphs.js';
export type { Sleeve } from '../model/asset-glyphs.js';
export function AssetGlyph({ asset }: { asset: Sleeve }) {
  return (
    <svg className="zp-asset-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <title>
        {asset === 'stable' ? 'USDC · stablecoin sleeve' : asset.toUpperCase()}
      </title>
      <path
        d={paths[asset]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
