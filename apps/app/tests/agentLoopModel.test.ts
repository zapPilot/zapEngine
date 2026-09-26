import { describe, expect, it } from 'vitest';

import {
  advanceAgentLoopPlayback,
  AGENT_LOOP_STEPS,
  agentLoopStepTone,
  isNewDeposit,
  replayButtonLabel,
  type AgentLoopPlayback,
} from '@/integration/agentLoopModel';

const STEP_COUNT = AGENT_LOOP_STEPS.length;

function tones(playback: AgentLoopPlayback | null, hasDeposit: boolean) {
  return AGENT_LOOP_STEPS.map((_, index) =>
    agentLoopStepTone(index, playback, hasDeposit),
  );
}

describe('AGENT_LOOP_STEPS', () => {
  it('lists the seven loop steps in order', () => {
    expect(AGENT_LOOP_STEPS.map((step) => step.label)).toEqual([
      'News detected',
      'Local Laya analysis',
      'Agent intent',
      'MultiBaas composed · LI.FI swap routed',
      'Wallet signs locally',
      'Confirmed on Base',
      'Video delivered',
    ]);
  });
});

describe('agentLoopStepTone', () => {
  it('shows every step waiting before the first on-chain deposit', () => {
    expect(tones(null, false)).toEqual(Array(STEP_COUNT).fill('waiting'));
  });

  it('shows the last run as complete when idle after a deposit', () => {
    expect(tones(null, true)).toEqual(Array(STEP_COUNT).fill('done'));
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
    ]);
    expect(tones({ mode: 'live', index: 0 }, true)[0]).toBe('active');
  });
});

describe('advanceAgentLoopPlayback', () => {
  it('steps forward and keeps the playback mode', () => {
    expect(
      advanceAgentLoopPlayback({ mode: 'live', index: 2 }, STEP_COUNT),
    ).toEqual({ mode: 'live', index: 3 });
  });

  it('ends after the last step', () => {
    expect(
      advanceAgentLoopPlayback(
        { mode: 'replay', index: STEP_COUNT - 1 },
        STEP_COUNT,
      ),
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

describe('replayButtonLabel', () => {
  it('says it is replaying while a replay runs', () => {
    expect(replayButtonLabel({ mode: 'replay', index: 2 }, 'Hack story')).toBe(
      'Replaying…',
    );
  });

  it('names the event when the run link provided one', () => {
    expect(replayButtonLabel(null, 'Hack story')).toBe('Replay Hack story');
    expect(replayButtonLabel({ mode: 'live', index: 0 }, 'Hack story')).toBe(
      'Replay Hack story',
    );
  });

  it('falls back to the last run without an event title', () => {
    expect(replayButtonLabel(null, null)).toBe('Replay last run');
  });
});
