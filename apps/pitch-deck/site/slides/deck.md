<!-- source: apps/landing-page/src/config/messages.ts -->
<!-- Keep this deck aligned with the landing-page MESSAGES object. -->

<!-- .slide: class="title-slide" -->

# A Non-Custodial BlackRock in Your Wallet.

Rules-based allocation across **S&P 500**, **BTC / ETH**, and **Stablecoins** — bundled into one signature you keep.

<p class="muted">Zap Pilot pitch deck · local Markdown source</p>

---

## The Behavior We Are Replacing

Self-directed investors have the tools to trade, but not the discipline to rebalance when regimes change.

- They over-buy greed and under-buy fear.
- They chase yield while ignoring allocation.
- They custody funds with products they should only be using for execution.

> **Buy in fear. Defend in greed.**

---

## The Product

Zap Pilot is a disciplined portfolio autopilot for self-custody wallets.

- Watches objective regime signals.
- Produces a target allocation.
- Sends a pre-built execution bundle.
- Leaves custody and signing with the user.

---

## The Strategy

The engine uses **200MA**, **Fear & Greed**, and **ETH/BTC** relative strength to decide when the portfolio should buy risk, defend in cash, or rotate inside crypto.

| Signal | Job | Outcome |
| --- | --- | --- |
| 200MA | Trend filter | Risk-on or risk-off |
| Fear & Greed | Sentiment filter | Buy weakness, defend froth |
| ETH/BTC | Crypto rotation | BTC or ETH tilt |

---

## Three Pillars

<div class="pillars">
  <div class="pillar">
    <strong>S&P 500</strong>
    Tokenized U.S. equity exposure gives the portfolio a traditional risk-on anchor.
  </div>
  <div class="pillar">
    <strong>BTC / ETH</strong>
    Digital asset beta is added when the regime rewards risk.
  </div>
  <div class="pillar">
    <strong>Stablecoins</strong>
    Defense becomes active when the rules call for capital preservation.
  </div>
</div>

---

## Strategy First, Yield Second

The core return driver is regime trading itself: buying weakness and defending during greed.

Yield is useful only after allocation is right.

- Ondo for tokenized S&P 500 exposure.
- GMX-style venues for BTC / ETH idle yield.
- Morpho or Hyperliquid-style venues for stablecoin yield.

---

## Proof To Keep Honest

Landing-page proof is anchored to the same backtest snapshot, not rewritten by hand here.

<div class="metric-grid">
  <div class="metric">
    <strong>ROI</strong>
    Strategy performance vs DCA baseline.
  </div>
  <div class="metric">
    <strong>Risk</strong>
    Max drawdown and Calmar stay visible.
  </div>
  <div class="metric">
    <strong>Trades</strong>
    Daily signal evaluation, real executed trades.
  </div>
</div>

<p class="muted">Past performance does not guarantee future results.</p>

---

## Execution

The user receives a Telegram message with the target allocation and a transaction bundle.

- **EIP-7702** batch on supported wallets.
- Sequential approval + execution fallback where 7702 is unavailable.
- One signature from the user's own EOA.
- No custody, no pooled funds, no hidden discretionary manager.

---

## Why Now

Tokenized equities, wallet-native execution, and intent-style transaction bundling make a self-custodial allocator practical.

The missing layer is not another yield dashboard. It is the disciplined decision system that tells users what to do next.

---

## Wedge

Start with a narrow, legible allocator:

- Three pillars users already understand.
- One Telegram-driven rebalance workflow.
- Backtest-first messaging tied to public landing-page claims.
- Expand later into richer policy controls and more execution venues.

---

## Narrative Contract

The landing page and pitch deck should tell the same story:

1. Non-custodial allocator.
2. Regime-aware decision engine.
3. Three-pillar portfolio.
4. One-signature execution.
5. Backtest proof with explicit risk disclaimer.

---

## Ask

Help Zap Pilot turn self-custody from a trading interface into a disciplined portfolio operating system.
