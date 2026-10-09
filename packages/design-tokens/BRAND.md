# Zap Pilot brand v3

Zap Pilot uses the same primitives across native UI, the website, story scenes and rendered media. `tokens.json` owns every role value and mark coordinate.

## Mark and lockup

The mark has a 32-unit viewBox: an open arc, three ticks and pivot use ink; the needle starts at 16,16 and follows `l-3.3-7.6` in sign-ink. Use the mark at 16 px for tiny identity, 22 px beside a label, 32 px in navigation, or 64 px as a standalone identity. Preserve its proportions and open space.

The wordmark is Archivo at width 108 and weight 640. The lockup pairs its outlined glyphs with the mark; the optional tagline is “Rules decide. You sign.” Both strings are shaped into paths by the pinned font generator. Do not substitute live text into exported assets.

## Modes and roles

| Role         | Paper   | Night   |
| ------------ | ------- | ------- |
| ground       | #f4f4f1 | #0e0f11 |
| sheet        | #ffffff | #16171a |
| well         | #eaeae5 | #1c1d21 |
| ink          | #111111 | #eeeeea |
| ink-2        | #45453f | #b9b9b3 |
| ink-3        | #5f5f59 | #989892 |
| sign         | #2540f5 | #4058ff |
| sign-ink     | #2540f5 | #9aa6ff |
| up           | #0f6d41 | #5bd18b |
| down / alert | #a83119 | #ff7a66 |

Text uses ink roles or sign-ink. Sign pigment is reserved for each page's primary action, wallet identity/connection, signing, focus, selection and the needle. User charts use ink; sleeve colors identify assets. Never use sign as a text color.

Paper/night sleeves identify SPY, stable, ETH, BTC and ALT. Their labels and positions accompany colors. Materials use top/front/left faces with separate edges, face inks, floor and shadow. Neutral scene materials retain their own roles; asset models combine sleeve pigments with these material roles for face highlights and edges.

Status conveys state by geometry: live is filled/solid, in-development is half/dashed, research is center-dot/dashed and planned is dashed-ring/dashed. Success uses ink with a filled glyph; caution uses ink-2 with rule-2 dashes. Alert is reserved for errors and destructive actions, while down describes numeric movement.

## Typography and motion

Archivo Variable supplies display/text and Martian Mono Variable supplies labels/data. Fifteen type roles define weight, width, size, line height and em tracking. Native uses ten named static instances, including MartianMono Data at width 87.5. Noto Sans TC provides renderer CJK fallback. Fonts must resolve from the package rather than copied host assets.

Radii are tag 2, control 6, panel 8, sheet 12 and round 999. Controls are 48/56 px, hit targets at least 44 px. Motion uses timing: enter (0.2,0,0,1), exit (0.4,0,1,1), scene (0.16,1,0.3,1). Press scale is 0.98; springs are retired. Overlay is the only elevation shadow.

## Reproduction

```bash
pnpm --filter @zapengine/design-tokens fonts
pnpm --filter @zapengine/design-tokens brand
pnpm turbo run build test:coverage --filter=@zapengine/design-tokens
```

`fonts/source/manifest.json` pins Google Fonts sources and hashes; `fonts/static/manifest.json` records instance metadata and hashes. OFL licenses travel with the fonts. `brand/glyphs.json` holds outlines and `brand/outputs.json` lists every generated host copy. SVGs, PNGs, ICO, ICNS and tray data all derive from the same mark.

## Retired system

The v2 champagne pigment #d4c5a3, Instrument Serif, Geist, JetBrains Mono, pillar/USD aliases, success/warning pigments, pill radius and springs are retired. Do not reintroduce legacy role names or compatibility aliases. The isolated KOKODE composition preserves its own established visual/motion contract. Control-center operational health colors are a documented host exception, with healthy/degraded labels and icons accompanying color.

Stablecoin marks (USDC and USDT) map to `sleeve.stable`; the sleeve represents stablecoins collectively, not a promise of a specific holding.
