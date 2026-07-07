# Claude Design Handoff — Zap Pilot Positioning Refresh

## Core positioning decision

The previous candidate framings were useful, but none should be the main user-facing positioning.

- **"BlackRock in your wallet"**: keep only as an investor-deck hook. It is memorable, but misleading for product positioning because Zap Pilot has no discretion, does not touch funds, and should not invite fund/adviser/licensing questions.
- **"Portfolio wallet"**: remove. Zap Pilot should not compete as a wallet distribution layer against MetaMask / OKX / Rabby / Phantom. It rides on Privy and existing wallet/delegation infrastructure.
- **"Non-custodial portfolio manager"**: accurate internally, risky externally because "portfolio manager" sounds like a regulated investment adviser role.
- **"Anti-FOMO rebalancing engine"**: strong content/community narrative, not the category. Use with the slogan, not as the hero category.
- **"Cross-chain robo-advisor"**: category is clear, but "cross-chain" is implementation detail. Users do not buy cross-chain; they buy disciplined allocation without giving up custody.
- **"Parking strategy for idle capital"**: onboarding step, not positioning. Yield is the weakest return component and should not define the product.

## Narrative hierarchy to design around

1. **User conversion layer**
   - Main line: **Your net worth, on autopilot.**
   - Trust line: **Signed from your wallet, held by no one else.**
   - Emotional line: **Buy in fear. Defend in greed.**
   - Plain-English category: **Self-custodial investment autopilot**.

2. **Category layer**
   - Use: **the self-custodial robo-advisor**.
   - Avoid: "cross-chain" in the main headline. Cross-chain / EIP-7702 / atomic bundle can appear as proof in lower sections.

3. **Investor layer**
   - Hook: **BlackRock in your wallet**.
   - Immediately land back on: track record, no custody, no discretion, wallet-signed execution.

## Design direction: “Calm cockpit, not crypto casino”

Design the landing page as a high-trust autopilot cockpit for personal net worth — disciplined, quiet, slightly institutional, but still crypto-native enough to feel on-chain.

### Visual language

- **Mood**: calm control, financial cockpit, premium black/gold, restrained data density.
- **Avoid**: wallet-war language, DeFi farming/yield-first visuals, loud neon gradients, generic SaaS blobs, "fund manager" imagery, Wall Street skyscraper clichés.
- **Hero should feel like**: the user owns the account; Zap Pilot is the instrument panel and autopilot, not the custodian.
- **Primary artifact**: app/home screen with net worth, allocation, regime telemetry, and pending rebalance/signature state.
- **Trust proof**: make "signed from your wallet, held by no one else" visually close to the CTA / hero account card.

### Suggested page structure

1. **Hero**
   - Kicker: Self-custodial investment autopilot
   - H1: Your net worth, on autopilot.
   - Subcopy: One account across S&P500, BTC/ETH, and stables. Every rebalance is signed from your wallet, held by no one else.
   - Trust chips: No custody / No discretion / No standing approvals
   - Visual: account cockpit card + allocation bar + regime signal + “Review bundle → Sign” state.

2. **Behavior replacement**
   - Headline: Buy in fear. Defend in greed.
   - Show what the engine replaces: over-buying greed, missing fear, chasing yield.
   - This is where “anti-FOMO” belongs.

3. **How it works**
   - Sense → Decide → Sign.
   - Keep the final step explicitly user-controlled.

4. **Track record / proof**
   - Investor credibility and category seriousness.
   - The story: trades drove return; yield is not the strategy.

5. **Where yield fits**
   - Rename/position as parking or baseline yield between trades, not the core value proposition.

6. **Execution / trust boundary**
   - Wallet-signed bundles, EIP-7702 where supported, sequential fallback otherwise.
   - No custody, no discretionary manager.

## Copy rules

Use:
- “self-custodial investment autopilot”
- “the self-custodial robo-advisor”
- “signed from your wallet, held by no one else”
- “Buy in fear. Defend in greed.”
- “wallet-signed execution”
- “no custody, no discretion”

Avoid on public product surfaces:
- “portfolio wallet”
- “portfolio manager”
- “BlackRock-style” except the pitch cover
- “cross-chain” as a hero/category phrase
- “parking strategy” as the main promise
- yield-first framing

## Assets/screenshots to prepare

Please prepare these before asking Claude Design to redesign or tighten the page:

1. **Current landing page screenshots**
   - Desktop hero fold (1440px wide)
   - Desktop full page or key sections
   - Mobile hero fold (~390px wide)
   - Mobile navigation / CTA state if relevant

2. **Product/app screenshots or mockups**
   - Home screen showing net worth, balance trend, allocation
   - Portfolio screen showing three-pillar allocation and metrics
   - Invest / rebalance confirmation flow showing “review bundle → sign”
   - Any wallet signature / transaction preview screen

3. **Proof assets**
   - Backtest chart / equity curve screenshot
   - Strategy metrics snapshot
   - Current allocation visualization

4. **Brand assets**
   - Zap Pilot logo SVG/PNG
   - Current color/token reference or brand guide
   - Any app icons / protocol logos used on the page

5. **Constraints**
   - Current tech stack: Next.js landing page in `apps/landing-page`
   - Keep existing product truth: self-custody, user signature, no custody, no discretionary manager
   - Do not invent regulatory claims or guaranteed returns

## Prompt to paste into Claude Design

Use the following prompt:

> Redesign / tighten the Zap Pilot landing page around this positioning: **Your net worth, on autopilot** + **signed from your wallet, held by no one else**. The category is **self-custodial investment autopilot** for users and **the self-custodial robo-advisor** for market understanding. Keep **BlackRock in your wallet** only as an investor-deck hook, not product positioning.
>
> The page should feel like a calm financial cockpit, not a crypto casino: premium dark, restrained gold accents, disciplined data surfaces, clear account ownership, and high trust. The core hero visual should communicate: net worth, three-pillar allocation across S&P500 / BTC+ETH / stables, regime telemetry, and a user-reviewed rebalance bundle that ends with wallet signature.
>
> Messaging rules: emphasize **Buy in fear. Defend in greed.**, **no custody**, **no discretion**, **no standing approvals**, and **wallet-signed execution**. Avoid “portfolio wallet,” “portfolio manager,” yield-first framing, “cross-chain” in the hero/category, and any implication that Zap Pilot manages money or has discretionary control.
>
> Please propose a visual direction and section-by-section landing page design. Prioritize conversion clarity and trust: users should instantly understand that Zap Pilot automates discipline, not custody. Use the provided screenshots/assets as product truth and do not invent unsupported features, guaranteed returns, or regulatory claims.
