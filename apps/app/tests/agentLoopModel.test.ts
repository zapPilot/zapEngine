import { describe, expect, it } from 'vitest';

import {
  advanceAgentLoopPlayback,
  agentLoopBadge,
  agentLoopStepTone,
  agentLoopSteps,
  formatProbability,
  isNewDeposit,
  type AgentLoopPlayback,
} from '@/integration/agentLoopModel';

const LAYA = {
  exchangeHack: { yes: 0.9587 },
  ethPressure: { upward: 0.7751, downward: 0.1255, none: 0.0993 },
};

function tones(playback: AgentLoopPlayback | null, hasDeposit: boolean) {
  return agentLoopSteps(LAYA).map((_, index) =>
    agentLoopStepTone(index, playback, hasDeposit),
  );
}

describe('agentLoopSteps', () => {
  it('lists the eight loop steps in order with the Laya snapshot in the decision', () => {
    const steps = agentLoopSteps(LAYA);
    expect(steps.map((step) => step.label)).toEqual([
      'News in',
      'Laya decides',
      'Rule fires',
      'Plan & Tenderly review',
      'Composed via MultiBaas',
      'Signed & broadcast',
      'Confirmed on Base',
      'Telegram smart link',
    ]);
    expect(steps[1]?.detail).toBe(
      'Exchange hack 95.9% · upward ETH pressure 77.5%',
    );
  });
});

describe('agentLoopStepTone', () => {
  it('shows every step waiting before the first on-chain deposit', () => {
    expect(tones(null, false)).toEqual(Array(8).fill('waiting'));
  });

  it('shows the last run as complete when idle after a deposit', () => {
    expect(tones(null, true)).toEqual(Array(8).fill('done'));
  });

  it('marks earlier steps done, the current one active, later ones waiting', () => {
    expect(tones({ mode: 'replay', index: 3 }, true)).toEqual([
      'done',
      'done',
      'done',
      'active',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ]);
    expect(tones({ mode: 'live', index: 0 }, true)[0]).toBe('active');
  });
});

describe('advanceAgentLoopPlayback', () => {
  it('steps forward and keeps the playback mode', () => {
    expect(advanceAgentLoopPlayback({ mode: 'live', index: 2 }, 8)).toEqual({
      mode: 'live',
      index: 3,
    });
  });

  it('ends after the last step', () => {
    expect(
      advanceAgentLoopPlayback({ mode: 'replay', index: 7 }, 8),
    ).toBeNull();
  });
});

describe('isNewDeposit', () => {
  it('never fires before the first successful load sets a baseline', () => {
    expect(isNewDeposit(undefined, '0xabc')).toBe(false);
  });

  it('fires only for a hash that differs from the baseline', () => {
    expect(isNewDeposit({ hash: '0xabc' }, '0xabc')).toBe(false);
    expect(isNewDeposit({ hash: '0xabc' }, '0xdef')).toBe(true);
    expect(isNewDeposit({ hash: null }, '0xdef')).toBe(true);
    expect(isNewDeposit({ hash: '0xabc' }, null)).toBe(false);
  });
});

describe('agentLoopBadge', () => {
  it('labels replays and live runs distinctly', () => {
    expect(agentLoopBadge(null)).toBeNull();
    expect(agentLoopBadge({ mode: 'replay', index: 0 })).toBe('Replay');
    expect(agentLoopBadge({ mode: 'live', index: 0 })).toBe('Live');
  });
});

describe('formatProbability', () => {
  it('keeps one decimal of the model output', () => {
    expect(formatProbability(0.9587)).toBe('95.9%');
    expect(formatProbability(0.0993)).toBe('9.9%');
    expect(formatProbability(1)).toBe('100.0%');
  });
});
