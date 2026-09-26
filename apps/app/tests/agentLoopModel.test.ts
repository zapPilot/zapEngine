import { describe, expect, it } from 'vitest';

import {
  advanceAgentLoopPlayback,
  AGENT_LOOP_STEPS,
  isNewDeposit,
  isRunInProgress,
  replayButtonLabel,
  stepLiveLine,
  timelineTones,
  type AgentLoopPlayback,
} from '@/integration/agentLoopModel';

import { agentRunStatus } from './support/agentRunStatus';

const STEP_COUNT = AGENT_LOOP_STEPS.length;
const swap = { kind: 'swap', index: 3, total: 5 } as const;
const entry = (text: string) => ({ text, link: null });

const running = agentRunStatus({
  activeStep: 'sign',
  transaction: swap,
  steps: {
    sign: {
      state: 'active',
      entries: [entry('Re-checking the guard before signing the swap')],
    },
  },
});
const failed = agentRunStatus({
  state: 'failed',
  finishedAt: 2_000,
  error: 'Error: swap reverted on-chain',
  transaction: swap,
  steps: {
    news: { state: 'done', entries: [] },
    analyze: { state: 'done', entries: [] },
    intent: { state: 'done', entries: [] },
    compose: { state: 'done', entries: [] },
    sign: { state: 'done', entries: [] },
    confirm: {
      state: 'failed',
      entries: [entry('Waiting for the swap receipt from MultiBaas')],
    },
  },
});

function tones(
  playback: AgentLoopPlayback | null,
  hasDeposit: boolean,
  run: Parameters<typeof timelineTones>[0]['run'] = null,
) {
  return timelineTones({ run, playback, hasDeposit });
}

describe('AGENT_LOOP_STEPS', () => {
  it('lists the seven loop steps in order, each with an explanation', () => {
    expect(AGENT_LOOP_STEPS.map((step) => step.label)).toEqual([
      'News detected',
      'Local Laya analysis',
      'Agent intent',
      'MultiBaas composed · LI.FI swap routed',
      'Wallet signs locally',
      'Confirmed on Base',
      'Video delivered',
    ]);
    for (const step of AGENT_LOOP_STEPS) {
      expect(step.explanation.length).toBeGreaterThan(40);
    }
    expect(
      AGENT_LOOP_STEPS.find((step) => step.id === 'analyze')?.explanation,
    ).toContain('never gates or shapes the trade');
  });
});

describe('timelineTones', () => {
  it('shows every step waiting before the first on-chain deposit', () => {
    expect(tones(null, false)).toEqual({
      tones: Array(STEP_COUNT).fill('waiting'),
      source: 'idle',
    });
  });

  it('shows the last run as complete when idle after a deposit', () => {
    expect(tones(null, true).tones).toEqual(Array(STEP_COUNT).fill('done'));
  });

  it('marks earlier steps done, the current one active, later ones waiting', () => {
    expect(tones({ mode: 'replay', index: 3 }, true)).toEqual({
      tones: [
        'done',
        'done',
        'done',
        'active',
        'waiting',
        'waiting',
        'waiting',
      ],
      source: 'replay',
    });
    expect(tones({ mode: 'live', index: 0 }, true)).toMatchObject({
      source: 'live',
    });
  });

  it('follows a run in progress over any playback', () => {
    for (const playback of [
      null,
      { mode: 'replay', index: 1 },
      { mode: 'live', index: 1 },
    ] as const) {
      expect(tones(playback, true, running)).toEqual({
        tones: ['done', 'done', 'done', 'done', 'active', 'waiting', 'waiting'],
        source: 'run',
      });
    }
  });

  it('lets a replay cover a finished run, which beats live playback', () => {
    expect(tones({ mode: 'replay', index: 0 }, true, failed).source).toBe(
      'replay',
    );
    const finished = tones({ mode: 'live', index: 0 }, true, failed);
    expect(finished.source).toBe('run');
    expect(finished.tones.at(5)).toBe('failed');
  });

  it('ignores an idle agent', () => {
    const idle = agentRunStatus({ state: 'idle', startedAt: null });
    expect(tones(null, true, idle)).toMatchObject({ source: 'idle' });
    expect(tones({ mode: 'live', index: 2 }, true, idle).source).toBe('live');
  });
});

describe('stepLiveLine', () => {
  it('names the transaction on steps 4–6', () => {
    expect(stepLiveLine(running, 'sign')).toBe(
      'Tx 3/5 · swap — Re-checking the guard before signing the swap',
    );
  });

  it('shows the error on a failed step', () => {
    expect(stepLiveLine(failed, 'confirm')).toBe(
      'Tx 3/5 · swap — Error: swap reverted on-chain',
    );
    expect(stepLiveLine({ ...failed, error: null }, 'confirm')).toBe(
      'Tx 3/5 · swap — Waiting for the swap receipt from MultiBaas',
    );
  });

  it('leaves the transaction out of the other steps', () => {
    const blocked = agentRunStatus({
      state: 'failed',
      finishedAt: 2_000,
      error: 'Blocked: Review did not pass. Nothing was signed.',
      steps: { intent: { state: 'failed', entries: [] } },
    });
    expect(stepLiveLine(blocked, 'intent')).toBe(
      'Blocked: Review did not pass. Nothing was signed.',
    );
    const news = agentRunStatus({
      activeStep: 'news',
      transaction: swap,
      steps: { news: { state: 'active', entries: [entry('Starting run…')] } },
    });
    expect(stepLiveLine(news, 'news')).toBe('Starting run…');
  });

  it('shows nothing for idle, done or empty steps', () => {
    expect(stepLiveLine(running, 'intent')).toBeNull();
    expect(stepLiveLine(running, 'confirm')).toBeNull();
    expect(
      stepLiveLine(agentRunStatus({ activeStep: 'news' }), 'news'),
    ).toBeNull();
  });
});

describe('isRunInProgress', () => {
  it('is true only while the agent is running', () => {
    expect(isRunInProgress(running)).toBe(true);
    expect(isRunInProgress(failed)).toBe(false);
    expect(isRunInProgress(null)).toBe(false);
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
    expect(
      replayButtonLabel({ mode: 'replay', index: 2 }, 'Hack story', false),
    ).toBe('Replaying…');
  });

  it('never says replaying while a real run is in progress', () => {
    expect(
      replayButtonLabel({ mode: 'replay', index: 2 }, 'Hack story', true),
    ).toBe('Replay Hack story');
  });

  it('names the event when the run link provided one', () => {
    expect(replayButtonLabel(null, 'Hack story', false)).toBe(
      'Replay Hack story',
    );
    expect(
      replayButtonLabel({ mode: 'live', index: 0 }, 'Hack story', false),
    ).toBe('Replay Hack story');
  });

  it('falls back to the last run without an event title', () => {
    expect(replayButtonLabel(null, null, false)).toBe('Replay last run');
  });
});
