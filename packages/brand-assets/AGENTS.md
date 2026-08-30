See @../AGENTS.md for shared package guidelines.

# Package-Specific Constraints

- `src/index.ts` is metadata only and must stay dependency-free and
  platform-neutral. It never references an image path: Metro's `require` and
  webpack's `import` return different shapes, so each app owns its own map from
  these keys to an image source.
- `assets/**` is generated. Never hand-edit or hand-add a PNG there. Add the
  original to `sources/` (SVG preferred), run `pnpm rasterize`, and commit both.
- `rasterize` is deliberately not part of `build`. Output is committed so CI and
  the Xcode bundle phase never need `sharp` or `@resvg/resvg-js`.
- Every file in `sources/` needs a row in [ATTRIBUTION.md](./ATTRIBUTION.md).
  A mark with no recorded origin cannot be re-fetched or replaced later.
- Adding a key to `CHAIN_BRAND`, `TOKEN_BRAND`, or `PROTOCOL_BRAND` without a
  matching asset is supported — consumers fall back to a glyph or monogram. That
  is what lets a key ship before its artwork exists.
- The three `*BrandKeyFor` / `*BrandSymbolFor` normalizers must keep returning
  `undefined` for unknown input. `DepositLeg.protocol` is an open `z.string()`
  on the wire, and wallet indexers invent token symbols.
