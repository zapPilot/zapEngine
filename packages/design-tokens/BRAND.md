# Zap Pilot Logo Redesign Brief

This is the canonical handoff brief for redesigning the Zap Pilot logo across
web, iOS, Android, and favicon surfaces.

It lives in `packages/design-tokens` because that package is the cross-platform
source of truth for brand tokens. The current logo assets use a legacy
purple/blue/amber system that conflicts with `packages/design-tokens/tokens.json`.
(The former `apps/landing-page/public/brand-guide.md` described that system
and was removed when this redesign landed.) The new logo must
move Zap Pilot onto the warm-gold, dark-first token system.

## Interface system v2 (2026-10-01)

The interface is dark only, with champagne gold `#d4c5a3`. Instrument Serif is reserved for display headings and large values; Geist is the interface family; JetBrains Mono is for numeric values and small labels. Runtime font family tokens use Expo registration names.

Use the canonical typography roles, 20px cards, 12px controls, 28px sheets, and 44px minimum hit targets. Small secondary text uses `ink-muted`; `ink-faint` is limited to decoration and disabled states. App, landing, control-center, and podcast video templates share the same token source.

## Status — Implemented (2026-07-09)

**Selected motif:** Direction C (Autopilot Compass) — the "Regime" dial variant
(candidate `1c` from the logo exploration). An open cockpit gauge with a single
needle reading the regime, graduated ticks, and a central pivot.

**Colors:** `color.accent` `#d4c5a3` on dark (canonical); `color.accent-muted`
`#6a5e44` with `#14110c` ink on the light-background variant. No new brand color
was added — `tokens.json` is unchanged.

**Typography:** the "Zap Pilot" wordmark is Instrument Serif (`font.serif`),
outlined to paths in the committed lockup SVGs; the tagline "Programmable
Portfolio Runtime" is JetBrains Mono (`font.mono`). The tagline changed in
2026-10 from "Disciplined Portfolio Autopilot".

**Tagline redraw:** outline the upper-case tagline with `@shuding/opentype.js`
from `apps/app/assets/fonts/JetBrainsMono-Medium.ttf` at 8.5px, pen start
x = 63, baseline y = 51, 1.8px letter-spacing (6.9px per character), fill
`#6a5e44` (`color.accent-muted`); coordinates use two decimals, drop `Z`
commands, and glyph paths join with one space. Regenerating the previous
tagline with these parameters reproduces its committed path exactly. Render
`zap-pilot-logo-tagline.png` with
`new Resvg(svg, { fitTo: { mode: 'width', value: 1152 }, background: 'rgba(0,0,0,0)' }).render().asPng()`
from `@resvg/resvg-js`; that call reproduces the committed PNG byte for byte.

**Regenerating rasters:** the SVG sources are canonical —
`apps/landing-page/public/zap-pilot-{icon,logo,logo-dark,logo-tagline}.svg` and
`apps/app/assets/brand/{icon,adaptive-foreground}.svg`. Every PNG/ICO/ICNS
(landing favicon + logo PNGs, Expo app icon/splash/adaptive/favicon/maskable,
desktop `build/icon.icns` + tray glyph) is derived from those SVGs; re-render
with an SVG rasterizer (e.g. `@resvg/resvg-js`) plus `iconutil` for `.icns`.

The sections below are retained as the original design brief and rationale.

## 1. Product Snapshot

Zap Pilot is:

> A runtime for programmable portfolios — your strategy, your machine, your
> wallet.

Every public capability claim carries its status — Live, Research, In
development or Planned — from `apps/landing-page/src/config/runtime.ts`. Today
a reference strategy, DMA/FGI Portfolio Rules, is evaluated daily on Zap
Pilot-hosted servers; deposits go straight into Morpho, GMX v2 and Hyperliquid
positions held at the user's own address; every batch is checked before the
user signs it. Rebalance plans, user strategies and policies, and running on
the user's own machine are planned.

Canonical copy from `apps/landing-page/src/config/messages.ts`:

| Role                    | Copy                                       |
| ----------------------- | ------------------------------------------ |
| Brand line              | Your strategy. Your machine. Your wallet.  |
| Category                | A runtime for programmable portfolios      |
| Nav                     | portfolio runtime                          |
| Lockup tagline          | Programmable Portfolio Runtime             |
| Reference strategy idea | Buy in fear. Defend in greed.              |
| Status vocabulary       | Live · Research · In development · Planned |

The brand line appears only where a status marker shares the screen: the home
page hero, Open Graph cards and the pitch cover. "Buy in fear. Defend in
greed." is the reference strategy's philosophy, not the brand's.

The reference strategy's target allocation spans three sleeves:

| Sleeve      | Role                                                     |
| ----------- | -------------------------------------------------------- |
| S&P 500     | Traditional risk-on anchor; modeled, not executable yet  |
| BTC / ETH   | Digital asset beta when the regime rewards risk          |
| Stablecoins | Defensive leg when the rules call for preserving capital |

The logo should feel like a calibrated instrument the owner operates — not a
trading bot or a fund manager.

## 2. Brand Personality

Use these five traits as the design filter:

### Sovereign

The user owns every layer. Assets stay at the user's own address, there is no
Zap Pilot vault, and nothing moves without the user's signature.

### Inspectable

Rules can be read, tested and recomputed. Status is stated plainly, and claims
never run ahead of what the code does.

### Deterministic

Rules decide, and the same inputs give the same target. Rhythm, geometry,
alignment and measured repetition can express rule-driven decisions.

### Composable

Strategy is the primitive; adapters encode protocol actions. The identity
should suggest parts that fit together under the owner's control.

### Composed

Zap Pilot balances its sleeves calmly. Avoid high-volatility signals: rockets,
moonshots, casino energy, meme references, or aggressive trading symbolism.

## 3. Target Audience

### Primary

Self-custody investors who want a rules-based portfolio process without
depositing into a vault or trusting a house strategy they cannot inspect. They
understand wallets, signing and EVM execution.

### Secondary

Quant-minded builders who want to read, backtest and eventually run their own
strategies on infrastructure they control.

### Excluded

This brand is not for incentive or yield farmers, meme-coin traders, NFT
collectors, or users seeking a custodial manager or promised returns.

## 4. Canonical Color System

Use `packages/design-tokens/tokens.json` as the color source of truth.

| Role             | Token                    | Hex / Value                 | Usage                              |
| ---------------- | ------------------------ | --------------------------- | ---------------------------------- |
| Background       | `color.bg`               | `#0a0a0a`                   | Default logo canvas                |
| Surface          | `color.surface`          | `#0e0e10`                   | Card or contained logo carrier     |
| Surface elevated | `color.surface-elevated` | `#18181b`                   | Optional elevated surface          |
| Ink              | `color.ink`              | `#f4f4f5`                   | Wordmark text on dark backgrounds  |
| Ink dim          | `color.ink-dim`          | `#a1a1aa`                   | Tagline or secondary wordmark text |
| Ink faint        | `color.ink-faint`        | `#52525b`                   | Low-emphasis detail only           |
| Line             | `color.line`             | `rgba(255, 255, 255, 0.08)` | Subtle border or construction line |
| Line high        | `color.line-hi`          | `rgba(255, 255, 255, 0.16)` | Stronger outline or carrier stroke |
| **Accent**       | `color.accent`           | **`#d4c5a3`**               | **Primary icon color**             |
| Accent soft      | `color.accent-soft`      | `rgba(212, 197, 163, 0.16)` | Optional glow or soft field        |
| Accent muted     | `color.accent-muted`     | `#6a5e44`                   | Shadow, edge, or recessed line     |
| Pillar - SPY     | `color.pillar.spy`       | `#d7dde7`                   | Optional strategy accent           |
| Pillar - BTC     | `color.pillar.btc`       | `#f7931a`                   | Optional strategy accent           |
| Pillar - USD     | `color.pillar.usd`       | `#2775ca`                   | Optional strategy accent           |

Color rules:

- The primary icon must use `#d4c5a3` or a direct tonal derivative.
- Pillar colors may be secondary accents only when the three-pillar strategy is
  explicit.
- Design first on `#0a0a0a`.
- Provide a light-background variant, but keep dark-first as canonical.
- Any added color must be proposed as a design-token addition before use.

Retired legacy colors:

| Legacy Use           | Retired Value |
| -------------------- | ------------- |
| Purple gradient stop | `#8B5CF6`     |
| Blue gradient stop   | `#3B82F6`     |
| Indigo gradient stop | `#6366F1`     |
| Amber lightning stop | `#F59E0B`     |
| Red lightning stop   | `#EF4444`     |
| Icon amber variant   | `#FBBF24`     |
| Old dark background  | `#0F172A`     |

These appear in legacy SVGs and the old brand guide only. They are not
canonical.

## 5. Typography

Typography should align with the token system and landing-page V2 design.

| Role                 | Token        | Font             | Recommendation                         |
| -------------------- | ------------ | ---------------- | -------------------------------------- |
| Wordmark             | `font.serif` | Instrument Serif | Primary recommendation for "Zap Pilot" |
| Tagline / UI pairing | `font.sans`  | Geist Sans       | Clean companion for small text         |
| Technical label      | `font.mono`  | JetBrains Mono   | Optional rule/signal notation          |

Rules:

- Replace the current Inter wordmark treatment.
- Prefer "Zap Pilot" title case for the primary lockup.
- Avoid all-caps "ZAP PILOT" unless a sketch proves it reads better at small
  sizes.
- Use `<text>` with fallback stacks during handoff to avoid embedded-font
  licensing issues.
- Outline final text only if licensing and future editability are confirmed.

Suggested SVG fallback stacks:

```svg
font-family="Instrument Serif, Georgia, serif"
font-family="Geist Sans, Inter, system-ui, sans-serif"
font-family="JetBrains Mono, SFMono-Regular, Consolas, monospace"
```

## 6. Motif Directions

Create 1-2 sketches for each direction, then let the team vote and converge.
Each direction should include icon-only, horizontal lockup, dark-canvas,
light-canvas, and small-size tests at 16 px, 22 px, 32 px, and 64 px.

### Direction A: Lightning Refined

Keep the "Zap" origin but redraw it from scratch.

Concept:

- Single-color warm-gold lightning using `#d4c5a3`.
- Prefer line, monoline, or precise geometric form over a filled comic-style
  bolt.
- Remove the current circuit nodes and decorative dot pattern.
- Replace the filled gradient circle with a thin outline or restrained carrier
  based on `color.line-hi`.
- Use `color.accent-muted` only as a subtle shadow or edge if it survives small
  sizes.

Pros: highest continuity with the current brand name; the "Zap" literal meaning
remains visible.

Risk: lightning marks are common in crypto and fintech, and weak execution can
feel generic or speculative.

Challenge: make the lightning feel like a precise portfolio signal, not a
high-voltage badge.

### Direction B: Three Pillars

Make the investment strategy the mark.

Concept:

- Three vertical pillars or calibrated bars represent SPY, BTC/ETH, and USD.
- Use `#d7dde7`, `#f7931a`, and `#2775ca` only when their strategy meaning is
  explicit.
- Use `#d4c5a3` as the unifying system layer: arc, route, top line, horizon, or
  autopilot path.
- Keep the bars measured and balanced, not like a generic analytics chart.
- Explore contained variants: circle, rounded square, or open frame.

Pros: directly visualizes the three-pillar allocator; pillar colors become
meaningful rather than decorative.

Risk: loses the immediate "Zap" reference and can become too chart-like without
a strong wordmark.

Challenge: make three assets feel like an active allocation engine, not a
dashboard icon.

### Direction C: Autopilot Compass

Make the "Pilot" origin and rule-driven navigation the mark.

Concept:

- Simplified compass, bearing marker, or navigation pointer.
- Use `#d4c5a3` for the primary needle, path, or directional geometry.
- Consider a subtle circular gauge or fear/greed scale, but keep it abstract.
- Avoid aviation cliches such as wings, propellers, clouds, or aircraft.
- The mark should imply that rules decide direction while the user remains in
  control.

Pros: strongest connection to "Pilot" and communicates discipline, direction,
and operating logic.

Risk: more abstract than lightning or pillars, and requires strong geometry to
stay legible at favicon size.

Challenge: make a compass that feels wallet-native and algorithmic, not travel
or aerospace branding.

### Optional Hybrid

Only if useful, test one hybrid after the three core directions: a compass
needle that also reads as refined lightning, three pillar ticks arranged as a
bearing or dial, or a gold autopilot path crossing three pillar points. Do not
combine motifs just to use every idea.

## 7. Technical Deliverables Checklist

### Web SVG

Place final SVGs in:

- `apps/landing-page/public/`

For the Expo app, mirror the same source assets under
`apps/app/assets/brand/` and reference them from `app.config.ts` or app code.
Do not point this brief at generated native folders; this repo no longer
commits retired native app projects or Expo prebuild output.

Required:

| File                         | Purpose                               | Suggested ViewBox |
| ---------------------------- | ------------------------------------- | ----------------- |
| `zap-pilot-icon.svg`         | Icon only; must scale to favicon      | `0 0 64 64`       |
| `zap-pilot-logo.svg`         | Horizontal lockup: icon + "Zap Pilot" | `0 0 200 60`      |
| `zap-pilot-logo-dark.svg`    | Light-background variant              | `0 0 200 60`      |
| `zap-pilot-logo-tagline.svg` | Lockup with tagline                   | Designer-defined  |

The existing logo uses `viewBox="0 0 200 60"`, so preserving that ratio for the
primary lockup will reduce replacement risk.

### Raster Fallbacks

Provide 2x PNG fallback files for each SVG:
`zap-pilot-icon.png`, `zap-pilot-logo.png`, `zap-pilot-logo-dark.png`, and
`zap-pilot-logo-tagline.png`.

### Favicon

Place `favicon.ico` in:

- `apps/landing-page/src/app/`

The `.ico` must contain 16 px, 32 px, and 48 px versions. The 16 px version
must be visually checked, not only auto-scaled.

For Expo web, place the web favicon source in `apps/app/assets/brand/` and wire
it through `web.favicon` in `apps/app/app.config.ts`.

### Web Manifest

Place maskable 192 x 192 and 512 x 512 PNGs in `apps/app/assets/brand/`.

Expo web manifest metadata should come from `apps/app/app.config.ts` unless a
separate static manifest is intentionally introduced. Use token-aligned
background and accent colors; do not reintroduce the retired purple theme
color.

### iOS

Place the iOS icon source in:

- `apps/app/assets/brand/`

Wire it through `icon` / `ios.icon` in `apps/app/app.config.ts`. If the project
later commits Expo prebuild output, generated `ios/` assets must match this
source, but the generated native folder is not the canonical handoff target.

### Android

Place Android adaptive icon source assets in:

- `apps/app/assets/brand/`

Wire them through `android.adaptiveIcon` in `apps/app/app.config.ts`, including
foreground/background layers and token-aligned background color. If generated
native folders are introduced later, they must be derived from these Expo
source assets.

### Source Files

Provide a Figma file or `.fig` export, production SVG exports, PNG fallbacks,
and construction notes identifying the chosen motif and color tokens used.

## 8. Constraints

Do:

- Design on `#0a0a0a`; use `#d4c5a3` as the main icon color.
- Keep the mark clear at 22 x 22 px and readable at 16 x 16 px.
- Provide vector source files, production SVGs, and PNG fallbacks.
- Use token colors unless this brief explicitly allows a pillar color.
- Preserve dark-first assumptions across web, app icons, and social surfaces.
- Provide clear-space guidance and a monochrome `#d4c5a3` version.

Don't:

- Do not use legacy purple/blue/amber colors.
- Do not use generic crypto tropes: Bitcoin "B", chain links, rockets, moons,
  diamond hands, laser eyes, or exchange-style token badges.
- Do not use heavy skeuomorphic gradients or non-token colors.
- Do not make the light-background variant the primary expression.
- Do not rely on circuit nodes or micro details for recognition.
- Do not make the logo feel like a bank, airline, or military contractor.

Small-size tests required: 16 x 16 px, 22 x 22 px, 32 x 32 px, 64 x 64 px,
192 x 192 px, and 512 x 512 px. At 16 px and 22 px, the mark must remain
recognizable without blur, broken shapes, or disappearing negative space.

Radius cues from tokens: `radius.subtle` (`4`) for small joins,
`radius.card` (`8`) for contained marks, `radius.control` (`12`) for UI
control-adjacent shapes, and `radius.pill` (`999`) only when a fully round
carrier is conceptually justified.

## 9. Reference Assets

Canonical source: `packages/design-tokens/tokens.json` and
`packages/design-tokens/README.md`.

Current copy and landing context:
`apps/landing-page/src/config/messages.ts`,
`apps/landing-page/src/config/runtime.ts`,
`apps/landing-page/src/components/landing-v2/Hero.tsx`, and
`apps/landing-page/src/components/landing-v2/Runtime.tsx`.

Product narrative: `apps/landing-page/src/app/pitch/page.tsx`,
`apps/landing-page/src/config/pitch.ts`,
`apps/landing-page/content/docs/index.mdx`,
`apps/landing-page/content/docs/architecture.mdx`, and
`apps/landing-page/content/docs/how-it-works.mdx`.

Legacy visual assets:

- `apps/landing-page/public/zap-pilot-logo.svg`
- `apps/landing-page/public/zap-pilot-logo.png`
- `apps/landing-page/public/zap-pilot-logo-dark.svg`
- `apps/landing-page/public/zap-pilot-logo-dark.png`
- `apps/landing-page/public/zap-pilot-icon.svg`
- `apps/landing-page/public/zap-pilot-icon.png`

App asset targets to create or update:

- `apps/app/assets/brand/`
- `apps/app/app.config.ts`

Legacy issues to fix:

- Purple/blue/indigo gradients are outside the token system.
- Amber/red lightning is outside the token system.
- Inter typography is outside the current token recommendation.
- Circuit nodes and dot patterns add detail that does not scale well.
- Any app web manifest or config colors must not use the retired purple theme.

## 10. Hand-Off Protocol

When the logo redesign is complete, implement it in a separate PR.

1. Place SVG and PNG assets in `apps/landing-page/public/` and
   `apps/app/assets/brand/`.
2. Wire app icon, iOS icon, Android adaptive icon, and web favicon paths in
   `apps/app/app.config.ts`.
3. Update landing-page favicon and logo references.
4. If a static Expo web manifest is intentionally introduced, put it in
   `apps/app/public/` (which does not exist today — generated Expo metadata
   is still the mechanism) in the same PR and document why generated Expo metadata
   is insufficient.
5. If the final design adds any brand color, add it to
   `packages/design-tokens/tokens.json`.
6. If tokens changed, run `pnpm --filter @zapengine/design-tokens build`.
7. Commit generated token outputs with token changes:
   `packages/design-tokens/dist/` and
   `packages/design-tokens/src/generated/tokens.ts`.
8. Update this file to record the selected motif direction, any approved color
   changes, and the final typography decision.
9. Replace, regenerate, or delete
   `apps/landing-page/public/brand-guide.md` so brand documentation does not
   diverge. (Completed — the file was deleted when this redesign landed.)

Expected implementation PR scope:

- Token files only if colors changed: `packages/design-tokens/tokens.json`,
  `packages/design-tokens/dist/`, and
  `packages/design-tokens/src/generated/tokens.ts`.
- Brand docs/assets:
  `packages/design-tokens/BRAND.md`,
  `apps/landing-page/public/zap-pilot-*`, and
  `apps/landing-page/src/app/favicon.ico`.
- Frontend assets:
  `apps/app/assets/brand/` and `apps/app/app.config.ts`.

Verification after asset replacement:

- `pnpm --filter @zapengine/design-tokens build`, if tokens changed.
- `pnpm --filter @zapengine/landing-page type-check`, if landing-page code
  changed.
- `pnpm turbo run type-check --filter=@zapengine/app`, if app code changed.
- Visual verification of the landing-page navbar and hero on desktop and mobile.
- Visual verification of Expo web favicon / manifest icon masking.
- iOS icon validation through Expo build/prebuild output when native packaging
  is exercised.
- Android adaptive launcher verification through Expo build/prebuild output
  when native packaging is exercised.

Approval criteria:

- Logo aligns with the token system.
- `#d4c5a3` is the primary icon color.
- Mark is recognizable at 16 px and 22 px.
- Dark-background version is the strongest version.
- Selected motif communicates disciplined rules, three pillars, self-custody,
  or pilot/autopilot direction.
- No retired purple/blue/amber colors are used.
- All required platform assets are delivered.
- Documentation and implementation no longer disagree about the brand palette.
