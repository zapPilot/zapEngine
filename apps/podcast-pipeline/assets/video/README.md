# Podcast video renderer assets

These files are deterministic runtime inputs for the static slide renderer.
Per-episode editorial images do not belong here; they are referenced by a
versioned manifest and stored in immutable object storage.

- `brand/zap-pilot-logo.svg`: Zap Pilot project artwork.
- `fonts/NotoSansCJKtc-Regular.otf` and `fonts/NotoSansCJKtc-Bold.otf`: Noto
  Sans CJK Traditional Chinese, SIL Open Font License 1.1.
- Archivo Text (400/600) and MartianMono SemiBold (600) resolve from
  `@zapengine/design-tokens/fonts/static/*`, with bundled OFL licenses.

- `brand/zap-pilot-outro.png`: 2880×2560 narrated outro scene for the 720×640 media window, generated at fourfold resolution.
- `brand/zap-pilot-signoff.svg`: 1080×1920 outlined brand sign-off with space for the publisher attribution row. Both display the canonical English slogan, Planned self-hosting marker and website, and are reproduced by the design-tokens brand generator.
