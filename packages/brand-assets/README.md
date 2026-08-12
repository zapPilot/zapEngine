# Brand Assets

Shared identity registry and artwork for the chains, tokens, and protocols the
product shows. One place so the mobile app and the landing page cannot drift.

## Layout

```
sources/      Originals as fetched (SVG preferred). Provenance only, never shipped.
assets/       Generated 256x256 PNGs. The only runtime format.
src/index.ts  Platform-neutral metadata: labels, fallback colors, glyphs, normalizers.
scripts/      rasterize.mjs — sources/ -> assets/, run by hand.
```

## Consuming it

Metadata comes from the package root; artwork comes from the `./assets/*`
subpath. Both are needed, and each app resolves the image its own way.

```ts
// Metadata — identical on every platform.
import { CHAIN_BRAND, chainBrandKeyForChainId } from '@zapengine/brand-assets';

// Artwork — React Native / Metro.
require('@zapengine/brand-assets/assets/tokens/usdc.png');

// Artwork — Next.js / webpack.
import usdc from '@zapengine/brand-assets/assets/tokens/usdc.png';
```

## Adding or replacing a mark

1. Put the original in `sources/<category>/<key>.<ext>` — SVG whenever one
   exists, since it rasterizes cleanly at any future size.
2. `pnpm rasterize`
3. Add the key to `CHAIN_BRAND` / `TOKEN_BRAND` / `PROTOCOL_BRAND` in
   `src/index.ts`, and add the image to each consuming app's resolution map.
4. Record the origin in [ATTRIBUTION.md](./ATTRIBUTION.md).
5. Commit `sources/`, `assets/`, and the code together.

A key with no artwork is a supported state — consumers render a glyph or
monogram fallback — so step 3 can land before the artwork does.

See [CLAUDE.md](./CLAUDE.md) for the invariants this package must keep.
