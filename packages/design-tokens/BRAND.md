# Zap Pilot Logo Redesign Brief

This is the canonical handoff brief for redesigning the Zap Pilot logo across
web, iOS, Android, and favicon surfaces.

It lives in `packages/design-tokens` because that package is the cross-platform
source of truth for brand tokens. The current logo assets and
`apps/landing-page/public/brand-guide.md` use a legacy purple/blue/amber system
that conflicts with `packages/design-tokens/tokens.json`. The new logo must
move Zap Pilot onto the warm-gold, dark-first token system.

This brief is the deliverable. Do not redesign or replace the logo assets in
this PR.

## 1. Product Snapshot

Zap Pilot is:

> A regime-driven 3-pillar allocator (S&P500 · BTC/ETH · Stables), executed
> from your own wallet in one bundled transaction. 100% self-custody.

Canonical copy from `apps/landing-page/src/config/messages.ts`:

| Role              | Copy                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| Marketing tagline | Disciplined Portfolio Autopilot                                                        |
| Hero claim        | A Non-Custodial BlackRock in Your Wallet.                                              |
| Philosophy        | Buy in fear. Defend in greed.                                                          |
| Hero subtitle     | Rules-based across S&P500, BTC/ETH, and stables — bundled into one signature you keep. |

The product watches objective regime signals, decides when a portfolio should
move between three asset pillars, and prepares a transaction bundle for the user
to review and sign from their own wallet.

The three pillars:

| Pillar      | Role                                                          |
| ----------- | ------------------------------------------------------------- |
| S&P 500     | Tokenized U.S. equity exposure and traditional risk-on anchor |
| BTC / ETH   | Digital asset beta when the regime rewards risk               |
| Stablecoins | Defensive cash leg when rules call for capital preservation   |

From the pitch narrative in `apps/landing-page/src/config/pitch.ts`:

> The engine uses 200MA, Fear & Greed, and ETH/BTC relative strength to decide
> when the portfolio should buy risk, defend in cash, or rotate inside crypto.

The logo should feel like a disciplined allocation system, not a generic DeFi
trading bot.

## 2. Brand Personality

Use these five traits as the design filter:

### Disciplined

Zap Pilot is a rules engine, not vibes. The mark should communicate control,
repeatability, and clear decision boundaries.

### Sovereign

The user remains in self-custody. Assets stay in the user's externally owned
account, and every rebalance is signed by the user.

### Elevated

The canonical visual language is warm gold on deep black. The tone should feel
premium, serious, and portfolio-native, not neon or speculative.

### Algorithmic

The product is regime-aware and backtest-first. Rhythm, geometry, alignment, or
measured repetition can express rule-driven decision-making.

### Composed

Zap Pilot balances three pillars. Avoid high-volatility signals: rockets,
moonshots, casino energy, meme references, or aggressive trading symbolism.

## 3. Target Audience

### Primary

Crypto-native users who want disciplined portfolio allocation but refuse
centralized custody. They understand wallets, signing, EVM execution, and the
risk of handing assets to opaque products.

### Secondary

Self-custody DeFi users who want rule-based allocation across tokenized
equities, BTC/ETH, and stables. They care about allocation first and yield
second.

### Excluded

This brand is not primarily for pure yield farmers, meme-coin traders, NFT
collectors, or users seeking a custodial robo-advisor.

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

Place final SVGs in both:

- `apps/landing-page/public/`
- `apps/app/public/`

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

Place `favicon.ico` in both:

- `apps/landing-page/public/`
- `apps/app/public/`

The `.ico` must contain 16 px, 32 px, and 48 px versions. The 16 px version
must be visually checked, not only auto-scaled.

### Web Manifest

Place maskable 192 x 192 and 512 x 512 PNGs in `apps/app/public/`.

Also update `apps/app/public/manifest.json`. It currently uses legacy
`theme_color: "#8b5cf6"` and should move to token-aligned background and accent
colors when assets are replaced.

### iOS

Place the full icon set in:

- `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/`

Include all current iOS sizes from 20 px through 1024 px, with @1x, @2x, and
@3x variants where required by Xcode. Preserve `Contents.json`.

### Android

Place launcher icons in:

- `apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `apps/mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `apps/mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`

If adaptive icons are added later, include foreground/background layers and
update Android resource references in the same PR.

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

Live copy and V2 landing context:
`apps/landing-page/src/config/messages.ts`,
`apps/landing-page/src/components/v2/HeroV2.tsx`,
`apps/landing-page/src/components/v2/PillarsV2.tsx`, and
`apps/landing-page/src/components/v2/HowItWorksV2.tsx`.

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
- `apps/landing-page/public/brand-guide.md`
- `apps/app/public/logo.svg`
- `apps/app/public/logo.png`
- `apps/app/public/manifest.json`

Legacy issues to fix:

- Purple/blue/indigo gradients are outside the token system.
- Amber/red lightning is outside the token system.
- Inter typography is outside the current token recommendation.
- Circuit nodes and dot patterns add detail that does not scale well.
- The web manifest still uses a retired purple theme color.

## 10. Hand-Off Protocol

When the logo redesign is complete, implement it in a separate PR.

1. Place SVG and PNG assets in `apps/landing-page/public/` and
   `apps/app/public/`.
2. Replace iOS app icons in
   `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/`.
3. Replace Android launcher icons in
   `apps/mobile/android/app/src/main/res/mipmap-*/`.
4. Update `apps/app/public/manifest.json` and both favicon locations.
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
   diverge.

Expected implementation PR scope:

- Token files only if colors changed: `packages/design-tokens/tokens.json`,
  `packages/design-tokens/dist/`, and
  `packages/design-tokens/src/generated/tokens.ts`.
- Brand docs/assets:
  `packages/design-tokens/BRAND.md`,
  `apps/landing-page/public/zap-pilot-*`,
  `apps/landing-page/public/favicon.ico`, and
  `apps/landing-page/public/brand-guide.md` if retained.
- Frontend assets:
  `apps/app/public/logo.svg`, `apps/app/public/logo.png`,
  `apps/app/public/manifest.json`, and `apps/app/public/favicon.ico`.
- Mobile assets:
  `apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/` and
  `apps/mobile/android/app/src/main/res/mipmap-*/ic_launcher.png`.

Verification after asset replacement:

- `pnpm --filter @zapengine/design-tokens build`, if tokens changed.
- `pnpm --filter @zapengine/landing-page type-check`, if landing-page code
  changed.
- `pnpm turbo run type-check --filter=@zapengine/app`, if app code changed.
- Visual verification of the landing-page navbar and hero on desktop and mobile.
- Visual verification of web manifest icon masking.
- Xcode asset validation for the iOS icon set.
- Android launcher verification across five mipmap densities.

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
