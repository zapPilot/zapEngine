# Fable5 question backlog

Last updated: 2026-07-07

Use this file to ask better follow-up questions after concrete execution. Do not ask fable5 the same strategic questions again without new evidence.

## How to ask fable5 next time

Paste only:

1. What changed since the last memo.
2. Which rows in [status-map.md](./status-map.md) moved status.
3. Evidence: PRs, metrics, user quotes, screenshots, revenue, failed calls.
4. One or two unresolved decisions.

Prompt template:

```text
Here is the delta since the last fable5 memo:

- Shipped:
- Metrics:
- User interviews / objections:
- Current blocker:
- Decision I need from you:

Please be hostile but fair. Do not restate the previous strategy unless the evidence invalidates it.
```

## Questions worth asking next

### 1. Is the trust claim marketing-safe yet?

Context: ADR 0002 sets the correct north star, and Privy prepare/confirm now includes simulation preview, typed-data intent signature, risk hash, and re-simulation. But Tier H/Privy does not satisfy the long-term self-custody claim, and the on-chain policy floor is not implemented.

Ask:

> Given the current trust model, what exact landing-page wording is honest but still converts? Is `signed from your wallet, held by no one else` too strong before Tier S + on-chain whitelist/cap/revoke exists?

### 2. Which proof should ship first: public track record or Telegram signal?

Context: fable5 recommended both as Week 1 actions. Track record builds trust; Telegram creates distribution. Solo-founder bandwidth probably means one gets the better polish first.

Ask:

> If only one proof surface can be polished first, should it be public track record or the free regime signal channel? Which one is more likely to move a crypto-native whale toward a $10k test?

### 3. What should the first design-partner offer be?

Context: The wedge ladder says signal -> Parking Strategy -> rebalance, but concierge users may need a sharper promise.

Ask:

> For the first 5 design partners, should the offer be `Parking Strategy for idle stablecoins`, `regime-based rebalance`, or `anti-FOMO allocation review`? What exact offer is most likely to get a second signature?

### 4. Base or Arbitrum for the single-chain cohort?

Context: Cross-chain is not the wedge. The current app already handles Base-oriented deposit planning and Hyperliquid flow, while many DeFi parking/rebalance opportunities may be easier to explain on Arbitrum or Base.

Ask:

> For a 30-day PMF cohort, should the product intentionally constrain to Base, Arbitrum, or one Base -> Hyperliquid path? Which choice minimizes trust/implementation risk while maximizing user-perceived value?

### 5. Is `self-custodial robo-advisor` the right category?

Context: This category is understandable, but `advisor` may create compliance and expectation risk. `Autopilot` is clearer emotionally but could overpromise automation before L3.

Ask:

> Is `self-custodial robo-advisor` still the best category label, or should the public category be softer, like `self-custodial allocation assistant` until automation and legal positioning are clearer?

### 6. How aggressively should HLP be used?

Context: HLP flow is a fast, topical hook, but fable5 warned it is a feature, not the wedge.

Ask:

> Should Hyperliquid/HLP appear on the landing page as a concrete example, or stay hidden behind the product flow so Zap Pilot does not look like a Hyperliquid deposit tool?

### 7. What is the minimum validation threshold?

Context: The 30-day plan uses second signature as the primary metric, but the threshold may be too strict or too weak.

Ask:

> For a solo founder selling to crypto-native whales, what validation threshold is strong enough to keep building: number of interviews, $ committed, first signatures, second signatures, paid conversions, or something else?

### 8. How much should Privy be exposed to whales?

Context: Privy is convenient, but the primary ICP likely already has EOAs and may distrust embedded-wallet infrastructure.

Ask:

> Should the whale path hide Privy entirely and default to BYO-EOA, or is Privy acceptable as long as it is clearly framed as the retail/onboarding rail?

### 9. What should be killed first if conversion is weak?

Context: If the first cohort does not convert, the failure could be ICP, trust model, strategy value, UX, or pricing.

Ask:

> If 20 interviews and 5 concierge attempts produce weak conversion, what diagnostic sequence should we use before concluding the product is wrong?
