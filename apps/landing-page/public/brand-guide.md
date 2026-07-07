# Zap Pilot Brand Guide

> Source of truth: `packages/design-tokens/tokens.json`. This document mirrors
> those tokens for humans — if the two ever disagree, `tokens.json` wins.

## Narrative

Zap Pilot is a **self-custodial portfolio account**. The landing page and the
app tell one story: your net worth, your three-pillar allocation, and a
disciplined engine that rebalances by regime — the last step is always your
signature.

> Buy in fear. Defend in greed.

## Color palette

| Token                  | Value                       | Usage                                          |
| ---------------------- | --------------------------- | ---------------------------------------------- |
| `--bg`                 | `#0a0a0a`                   | Page background                                |
| `--bg-2` / `--surface` | `#0e0e10`                   | Cards, panels                                  |
| `--surface-elevated`   | `#18181b`                   | Elevated surfaces                              |
| `--ink`                | `#f4f4f5`                   | Primary text                                   |
| `--ink-dim`            | `#a1a1aa`                   | Secondary text                                 |
| `--ink-faint`          | `#52525b`                   | Tertiary text, numeral fractions               |
| `--line`               | `rgba(255, 255, 255, 0.08)` | Hairline borders                               |
| `--accent`             | `#d4c5a3`                   | Brand gold: CTAs, sparkline, molten highlights |
| `--accent-soft`        | `rgba(212, 197, 163, 0.16)` | Gold washes                                    |
| `--success`            | `#7ad88f`                   | Positive deltas                                |
| `--error`              | `#ff6f61`                   | Negative deltas                                |
| `--spy`                | `#d7dde7`                   | S&P 500 pillar                                 |
| `--btc`                | `#f7931a`                   | BTC · ETH pillar                               |
| `--usd`                | `#2775ca`                   | Stablecoin pillar                              |

Dark, metallic, restrained. No purple/blue gradient washes, no generic
SaaS glow. Pillar colors appear only in allocation contexts.

## Typography

| Role               | Font             | Notes                                                  |
| ------------------ | ---------------- | ------------------------------------------------------ |
| Display / numerals | Instrument Serif | Net worth at 54/58, hero display sizes                 |
| Body / UI          | Geist Sans       | Loaded via `next/font`, exposed as `--font-geist-sans` |
| Data / kickers     | JetBrains Mono   | 9.5px uppercase kickers, letter-spacing ≈ 0.95px       |

Never fall back to an Inter/Arial-first stack; the sans stack starts with
Geist on every surface (web, app, docs).

## Motion

- One shared easing: `cubic-bezier(0.2, 0.65, 0.3, 0.99)` (`--easing-primary`).
- Hero storyboard: pour → settle → account reveal → rebalance pulse
  (~8s idle loop). The terminal state is always the account card.
- Honor `prefers-reduced-motion`: skip straight to the final, legible state.

## Radii

`--radius-pill` 999px · `--radius-control` 12px · `--radius-card` 8px
(app cards render at 15px) · `--radius-subtle` 4px
