# Unified Invest Experience

## Goal

Replace the current chain/destination-oriented invest entry points with one portfolio-oriented flow.

A user should be able to:

1. enter one investment amount;
2. fund it from any supported wallet balance;
3. use a saved or edited target allocation;
4. let Zap Pilot determine the required bridge, swap, and deposit actions;
5. review the resolved route once before execution.

The user should not need to choose between `Both`, `Base`, `Arbitrum`, `HLP`, or `Bridge` as product concepts.

![Unified invest mockups](./unified-invest-flow.svg)

## Current problem

`InvestAmountScreen.tsx` currently exposes implementation details as five tabs:

- Both
- Base
- Arbitrum
- HLP
- Bridge

This made sense while each execution path was being built independently, but it does not match the intended one-stop product experience now that the HLP path is executable.

`useInvest.tsx` also models the draft mainly as:

- `scope: both | base | arbitrum`
- `destination: strategy | hlp`

That shape makes chains and one destination type first-class user choices. It will become increasingly awkward as more chains, protocols, and destinations are added.

## Proposed product model

The primary user concepts should be:

- **Funding** — how much value is available and which wallet balances Zap Pilot may use.
- **Target allocation** — where the user wants the portfolio exposure to end up.
- **Execution plan** — internal bridge/swap/deposit actions derived from funding + target allocation.

Conceptually:

```ts
type TargetAllocation = {
  positionId: string;
  weightBps: number;
};

type FundingSource = {
  chainId: number;
  token: Address;
  availableAmount: bigint;
};

type InvestDraft = {
  totalUsd6: string;
  fundingMode: 'auto' | 'manual';
  fundingSources: FundingSource[];
  targetAllocations: TargetAllocation[];
};
```

Example target:

```ts
[
  { positionId: 'morpho-base', weightBps: 4000 },
  { positionId: 'gmx-arbitrum', weightBps: 3500 },
  { positionId: 'hlp', weightBps: 2500 },
];
```

The planner should resolve the target into bridge/swap/deposit legs instead of the UI selecting those routes directly.

## Mockup options

### A — Allocation first

Best incremental replacement for the current tabs.

The user enters an amount, selects `Auto` funding, then sees editable target allocations. The screen may summarize the expected number of bridges/swaps/deposits but does not make those implementation details interactive.

### B — Route visualizer

Best for the review step rather than the primary input screen.

It visually explains:

`wallet balances → Zap Router → Base / Arbitrum / Hyperliquid positions`

This is useful for trust and review, but bridge/swap mechanics should remain derived output rather than user configuration.

### C — Strategy first

Preferred long-term primary experience.

The user deposits into a saved strategy such as `Balanced Yield`. New capital can be allocated toward the portfolio target rather than mechanically applying the same split on every deposit.

For example, if Morpho is underweight and GMX is overweight, a new deposit can bias toward Morpho so the overall portfolio moves toward the configured target.

## Recommended composition

Use all three concepts at different layers:

- **Step 1:** C — Strategy first
- **Edit allocation:** A — Allocation first
- **Step 2 / review:** B — Route visualizer

The default flow becomes:

```text
Amount
  ↓
Saved strategy / target allocation
  ↓
Auto funding from supported wallet balances
  ↓
Planner resolves bridge + swap + deposit legs
  ↓
Single route review
  ↓
Guided execution with checkpoints
```

## Funding behavior

`Auto` funding should prefer existing balances before creating cross-chain movements.

A reasonable planner objective is:

1. use supported assets already present on the destination chain;
2. swap locally when necessary;
3. bridge only the destination shortfall;
4. minimize unnecessary bridge actions and gas;
5. preserve destination minimums / keeper-fee requirements;
6. treat Hyperliquid/HLP as another target position even though its final action uses the approved Hyperliquid agent flow.

The exact optimization policy can remain deterministic and simple initially. The important architectural change is that funding chains are inputs to the planner, not top-level product tabs.

### What Phase 1 implements

Morpho and GMX draw on their own destination chain, so their funding token stays a
user choice on Base and Arbitrum respectively.

HLP is the one position with no chain of its own, so the amount screen resolves its
funding automatically. It picks the first supported wallet source that can cover the
whole HLP share by itself, after subtracting whatever Morpho and GMX have already
claimed from the same token:

`Arbitrum USDC → Base USDC → Ethereum USDC → Base ETH → Arbitrum ETH → Ethereum ETH`

Splitting HLP across two sources is deliberately not attempted: it would mean two
bridges and two vault deposits for one position.

The route into HyperCore is then chosen server-side, in `composeDeposit`:

- native Arbitrum USDC goes straight into Hyperliquid's own Bridge2 escrow — a plain
  ERC-20 transfer, 1:1, no bridge fee and no route to poll;
- every other source (Base or Ethereum, USDC or native ETH) bridges into HyperCore
  through LI.FI in a single reviewed batch.

Either way the user signs one wallet batch for HLP. The vault deposit that follows is
signed by the approved Hyperliquid agent, not by the wallet.

## Execution / review expectations

`InvestRouteScreen.tsx` is one review surface listing every reviewed batch the
investment needs, in execution order — one batch per funded position:

- Morpho: a Base batch (swap when funded with ETH, then supply);
- GMX: an Arbitrum GM-basket batch;
- HLP: one batch on whichever chain funds it, bridging into HyperCore.

Only the first batch is submitted from the review screen. Every later batch pauses at a
checkpoint on the progress screen, is re-reviewed against the chain it executes on, and
is compared against the fingerprints the user already saw before it can be confirmed. A
confirmed batch is never resubmitted, so a partially completed multi-chain investment
resumes rather than starting over.

The checkpoint queue lives in frontend state. The server persists no multi-batch
session: each batch is an independent, self-contained `/plan-orchestration/deposit/review`
request bound by its own expiry and hashes.

## Bridge tab

The current standalone Bridge UI is useful as a development/testing utility but should not remain a primary user-facing invest tab.

Keep it behind a dev/internal route if it remains useful for diagnostics.

## Suggested implementation phases

### Phase 1 — UI/model convergence

- remove the five-way product tab from the default invest flow;
- introduce `targetAllocations` in the invest draft;
- add an `Auto` funding mode;
- keep the current working execution paths underneath;
- map the initial target set to the existing Base / Arbitrum / HLP implementations.

### Phase 2 — Unified planning

- make the orchestration API accept funding sources + target allocations;
- return a heterogeneous execution plan;
- resolve bridge shortfalls automatically;
- collapse positions that share one source chain into a single batch — Base USDC
  funding both Morpho and HLP is already expressible as one `split` request, but
  Phase 1 still sends one request per position.

### Phase 3 — Target-aware deposits

- read current portfolio weights;
- allocate new capital toward target weights;
- optionally expose explicit `Rebalance` separately from `Invest`;
- support additional chains/protocols without adding new top-level tabs.

## Non-goals for the first implementation

- globally optimal bridge routing;
- arbitrary user-selected DeFi protocols;
- replacing the already-working HLP signing/execution flow;
- exact portfolio rebalance through selling existing positions.

The first milestone is a unified product experience over the execution paths that already work.
