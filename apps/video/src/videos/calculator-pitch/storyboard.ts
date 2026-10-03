import type { SceneSpec, Storyboard } from '../../timeline/types';

// Cue fields name a phrase from the scene's narration; the visual keyed to it
// starts when that phrase is spoken (see timeline/captions.ts `cueOffset`).

type HookProps = {
  readonly kicker: string;
  readonly claim: string;
  readonly punch: string;
  readonly punchCue: string;
};

type RuleProps = {
  readonly kicker: string;
  readonly inputs: readonly string[];
  readonly output: string;
  readonly contractCue: string;
};

type InputsProps = {
  readonly kicker: string;
  readonly encodeCue: string;
};

type ProofProps = {
  readonly kicker: string;
  readonly callCue: string;
  readonly barsCue: string;
  readonly matchCue: string;
};

type ScenarioProps = {
  readonly kicker: string;
  readonly holdCue: string;
};

type DeployProps = {
  readonly kicker: string;
  readonly wallet: string;
  readonly note: string;
};

type ScopeProps = {
  readonly kicker: string;
  readonly proves: string;
  readonly doesNotProve: string;
  readonly limitCue: string;
};

type CtaProps = {
  readonly claim: string;
  readonly punch: string;
};

export type CalculatorScene =
  | SceneSpec<'hook', HookProps>
  | SceneSpec<'rule', RuleProps>
  | SceneSpec<'inputs', InputsProps>
  | SceneSpec<'proof', ProofProps>
  | SceneSpec<'scenario', ScenarioProps>
  | SceneSpec<'deploy', DeployProps>
  | SceneSpec<'scope', ScopeProps>
  | SceneSpec<'cta', CtaProps>;

/**
 * The script. Change copy, narration or scene order here, then run
 * `pnpm voiceover calculator-pitch` (only edited lines are re-synthesised)
 * and `pnpm stills calculator-pitch` to look at the result.
 * Numbers on screen come from facts.ts, never from this file.
 */
export const storyboard = {
  id: 'calculator-pitch',
  fps: 30,
  width: 1920,
  height: 1080,
  maxSeconds: 59.5,
  transitionFrames: 12,
  leadIn: 12,
  tail: 14,
  gap: 9,
  voice: { speed: 1.06 },
  scenes: [
    {
      id: 'hook',
      leadIn: 18,
      props: {
        kicker: 'Zap Pilot · Verifiable Strategy Calculator',
        claim: 'Don’t trust the backtest.',
        punch: 'Recompute it.',
        punchCue: 'Few',
      },
      vo: [
        {
          id: 'hook',
          text: 'Every strategy shows a backtest. Few let you recompute a decision.',
        },
      ],
    },
    {
      id: 'rule',
      props: {
        kicker: 'One production rule, on-chain',
        inputs: ['Prices', '200-day averages', 'Allocation', 'Rule state'],
        output: 'Decision',
        contractCue: 'in a public Vyper contract',
      },
      vo: [
        {
          id: 'rule',
          text: 'Zap Pilot put one production rule — the 200-day moving-average exit — in a public Vyper contract on Arbitrum Sepolia.',
        },
      ],
    },
    {
      id: 'inputs',
      props: {
        kicker: 'Real inputs · 2025-10-18',
        encodeCue: 'Every value',
      },
      vo: [
        {
          id: 'inputs',
          text: 'Load the real inputs from October 18th, 2025. Every value is encoded to exactly 18 decimals.',
        },
      ],
    },
    {
      id: 'proof',
      props: {
        kicker: 'Read-only proof',
        callCue: 'Then',
        barsCue: 'move BTC',
        matchCue: 'the same result',
      },
      vo: [
        {
          id: 'proof-bytecode',
          text: 'The app first checks the deployed bytecode against a pinned codehash.',
          say: 'The app first checks the deployed bytecode against a pinned code hash.',
        },
        {
          id: 'proof-decision',
          text: 'Then read-only calls return the decision: move BTC and ETH, 13.75% of the portfolio, to stablecoins — the same result as our Python backtest.',
          say: 'Then read-only calls return the decision: move bitcoin and ether, 13.75% of the portfolio, to stablecoins — the same result as our Python backtest.',
        },
      ],
    },
    {
      id: 'scenario',
      props: {
        kicker: 'Change one input',
        holdCue: 'holds',
      },
      vo: [
        {
          id: 'scenario',
          text: 'Change an input, and the contract holds instead.',
        },
      ],
    },
    {
      id: 'deploy',
      props: {
        kicker: 'Deterministic deployment',
        wallet: 'Rabby wallet · EIP-6963',
        note: 'Test ETH only · no keys in the app',
      },
      vo: [
        {
          id: 'deploy',
          text: 'Deployment is deterministic — CREATE2 from Rabby, test ETH only, no keys in the app.',
          say: 'Deployment is deterministic — create-two from Rabby, test ether only, no keys in the app.',
        },
      ],
    },
    {
      id: 'scope',
      props: {
        kicker: 'Scope',
        proves: 'What this bytecode returns for these inputs',
        doesNotProve: 'Market data, prior state or production execution',
        limitCue: 'not the market data',
      },
      vo: [
        {
          id: 'scope',
          text: 'It’s one of six rules: it proves the math, not the market data.',
        },
      ],
    },
    {
      id: 'cta',
      tail: 45,
      props: {
        claim: 'Don’t trust the backtest.',
        punch: 'Recompute it.',
      },
      vo: [{ id: 'cta', text: 'Don’t trust the backtest. Recompute it.' }],
    },
  ],
} as const satisfies Storyboard<CalculatorScene>;
