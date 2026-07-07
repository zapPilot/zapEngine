# 30-day PMF plan

Last updated: 2026-07-07

Goal: maximize product-market-fit evidence, not feature count.

Primary metric: `second signed bundle rate` among target design partners. A user signing the second bundle is stronger proof than a first curious deposit.

## Sprint constraints

For 30 days, freeze:

- desktop-native work
- mobile polish unless it blocks a design partner
- podcast/content pipeline work unrelated to distribution
- new adapters
- DAO/Safe work
- family office / allocator sales motion
- broad dashboard features
- cross-chain breadth as a selling point

## North-star cohort

Target users:

- $50k-$5M on-chain
- already self-custodying
- has lived through at least one bull/bear cycle
- has made emotional allocation mistakes
- is busy with work/founding/trading and does not want to stare at markets daily
- willing to sign from an existing EOA if the trust model is legible

## Week 1 — Public proof surface

Objective: make the engine observable before asking for trust.

Tasks:

- [ ] Publish a public track-record page for the current live strategy/wallet.
- [ ] Expose the daily decision log in a way that can later be backed by the append-only ledger.
- [ ] Launch or prepare a read-only public Telegram regime signal channel.
- [ ] Add landing-page A/B copy:
  - A: `Your net worth, on autopilot — self-custodial`
  - B: `Buy in fear. Defend in greed. Signed from your own wallet.`
- [ ] Draft the security-model page around four proofs:
  - audited/known delegate path or honest current-stage wording
  - one-click revoke / delegation status explanation
  - simulation diff before signing
  - public live track record

Evidence to collect:

- Signal subscribers
- Landing conversion to wallet-connect intent
- Which headline gets replies or signups
- Objections from public comments/DMs

## Week 2 — Talk to people, not code

Objective: validate whether the selected ICP has urgent enough pain.

Tasks:

- [ ] Interview 15-20 target users.
- [ ] Ask the same core questions every time:
  1. How do you manage allocation today?
  2. What emotional trade did you regret most in the last cycle?
  3. How much did that mistake cost?
  4. What proof would make you sign a $10k test bundle?
  5. Would you prefer a non-custodial version over a hypothetical custodial/autopilot version, and at what price?
- [ ] Recruit 5 concierge design partners.
- [ ] Capture every trust objection in [status-map.md](./status-map.md).

Evidence to collect:

- Number of users verbally willing to test with $10k
- Top 5 trust blockers
- Whether `self-custodial` is a buying reason or merely a requirement
- Whether `anti-FOMO` feels like a product promise or just marketing copy

## Week 3 — One path only

Objective: make one trust-ladder path sharp enough for design partners.

Recommended path:

1. Connect existing wallet / verify address
2. See track record + current regime signal
3. Enter Parking Strategy or first rebalance
4. Review simulation diff
5. Sign bundle
6. Receive follow-up notification and next suggested action

Tasks:

- [ ] Pick one chain/path for the cohort. Prefer the one that minimizes implementation risk and maximizes proof speed.
- [ ] Make simulation diff the decisive confirm surface.
- [ ] Add explicit worst-case language: min received, approval cap, route, failure mode.
- [ ] Store enough execution state to recover or manually support a failed design-partner run.
- [ ] Instrument first signature, completed execution, and second signature.

Evidence to collect:

- First signed bundle count
- Second signed bundle count
- Time from intro -> wallet connected -> first signature
- Any abandonment point before signing

## Week 4 — Pricing smoke test

Objective: test willingness to pay before expanding product surface.

Options:

- [ ] Routing/integrator fee on supported routes.
- [ ] $29/month paid signal tier for advanced regime/action bundle.
- [ ] $99/month concierge auto-bundle tier for design partners.
- [ ] Portfolio-size subscription tier waitlist, without chain-level AUM/performance fees.

Evidence to collect:

- Signal subscriber -> wallet connect conversion
- Wallet connect -> first deposit/signature conversion
- First signature -> second signature conversion
- Paid conversion or explicit refusal reasons
- Median intended deposit size

## Kill signals

If two or more happen, stop adding features and revisit ICP/trust model:

- <5% of signal subscribers connect a wallet.
- No design partner signs a second bundle.
- 20 interviews produce zero credible $10k test commitments.
- Pricing smoke test produces zero paid commitments.
- Users repeatedly prefer a custodial/autopilot product despite saying they care about self-custody.

## Definition of done for the sprint

A successful 30-day sprint is not `more features shipped`.

It is one of:

- at least 5 design partners and at least 2 second signatures, or
- clear evidence that the whale ICP is wrong, or
- clear evidence that the trust model blocks conversion before product value can be tested.
