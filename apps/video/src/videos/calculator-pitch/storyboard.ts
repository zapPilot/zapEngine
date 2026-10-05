import type { SceneSpec, Storyboard } from '../../timeline/types';

// Cue fields name a phrase from the scene's narration; the visual keyed to it
// starts when that phrase is spoken (see timeline/captions.ts `cueOffset`).

interface HookProps {
  readonly kicker: string;
  readonly claim: string;
  readonly punch: string;
  readonly punchCue: string;
}

/** Serif headline; `accent` closes it in gold italic. */
interface Title {
  readonly lead: string;
  readonly accent: string;
}

interface RuleProps {
  readonly kicker: string;
  readonly title: Title;
  readonly inputs: readonly string[];
  readonly output: string;
  readonly contractCue: string;
}

interface InputsProps {
  readonly kicker: string;
  readonly encodeCue: string;
  /** Labels for the three encoding steps of the BTC price. */
  readonly encoding: {
    readonly heading: string;
    readonly cell: string;
    readonly digits: string;
    readonly wad: string;
  };
}

interface ProofProps {
  readonly kicker: string;
  /** The bytecode check: pinned artifact vs what the chain serves. */
  readonly codehash: {
    readonly cue: string;
    readonly expected: string;
    readonly observed: string;
    readonly verdict: string;
  };
  /** What "Call contract" runs, shown while it runs. */
  readonly calls: { readonly label: string; readonly path: string };
  readonly callCue: string;
  readonly barsCue: string;
  readonly matchCue: string;
}

interface ScenarioProps {
  readonly kicker: string;
  /** The edited input, as the calculator describes the scenario. */
  readonly change: string;
  readonly holdCue: string;
}

interface DeployProps {
  readonly kicker: string;
  readonly title: Title;
  readonly wallet: string;
  readonly note: string;
  readonly create2Cue: string;
  readonly noteCue: string;
}

interface ScopeProps {
  readonly kicker: string;
  /** Caption under the "1 of 6" count. */
  readonly countLabel: string;
  readonly proves: string;
  readonly doesNotProve: string;
  readonly limitCue: string;
}

interface CtaProps {
  readonly claim: string;
  readonly punch: string;
  readonly punchCue: string;
}

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
  music: {
    loop: 'drive-112',
    base: 1,
    ducked: 0.2,
  },
  voice: { speed: 1.06, voice: 'hannah' },
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
        title: { lead: 'The 200-day exit,', accent: 'as public bytecode.' },
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
        encoding: {
          heading: 'BTC close · Oct 18 · decision day',
          cell: 'The cell shows',
          digits: 'Selected, every digit',
          wad: 'The contract receives × 10¹⁸ as uint256',
        },
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
        codehash: {
          cue: 'against a pinned codehash',
          expected: 'Pinned artifact · runtime codehash',
          observed: 'Deployed bytecode · keccak256(eth_getCode)',
          verdict: 'Codehash matches',
        },
        calls: {
          label: 'Three calls · one block',
          path: 'warmup → observe → cross_down_exit',
        },
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
        change: 'BTC closes 1% above its 200-day average',
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
        title: { lead: 'Same bytecode, same salt,', accent: 'same address.' },
        wallet: 'Signed in Rabby · EIP-6963',
        note: 'Test ETH only · no keys in the app',
        create2Cue: 'CREATE2',
        noteCue: 'test ETH only',
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
        countLabel: 'production rules on-chain',
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
        punchCue: 'Recompute',
      },
      vo: [{ id: 'cta', text: 'Don’t trust the backtest. Recompute it.' }],
    },
  ],
} as const satisfies Storyboard<CalculatorScene>;
