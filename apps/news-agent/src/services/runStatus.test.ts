import {
  AGENT_RUN_STEP_IDS,
  type AgentRunStatus,
  AgentRunStatusSchema,
} from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import { hash } from '../test-utils/fixtures.js';
import type { DemoProgress } from './demo.js';
import {
  applyProgress,
  finishRun,
  idleRunStatus,
  startRun,
} from './runStatus.js';

const EPISODE = '0f85db1e-ae06-45ea-89a7-360ec63ff072';
const swap = { kind: 'swap', index: 3, total: 5 } as const;
const deposit = { kind: 'deposit', index: 5, total: 5 } as const;

const states = (status: AgentRunStatus) =>
  AGENT_RUN_STEP_IDS.map((id) => status.steps[id].state);
const texts = (status: AgentRunStatus, id: keyof AgentRunStatus['steps']) =>
  status.steps[id].entries.map((entry) => entry.text);
const apply = (status: AgentRunStatus, events: DemoProgress[]) =>
  events.reduce(applyProgress, status);
const started = () => startRun(idleRunStatus(EPISODE), 1_000);

describe('run status', () => {
  it('starts idle and marks news active the moment a run starts', () => {
    const idle = idleRunStatus(EPISODE);
    expect(idle).toMatchObject({ state: 'idle', episode: EPISODE });
    expect(states(idle)).toEqual(Array(7).fill('waiting'));

    const run = startRun(idle, 1_000);
    expect(run).toMatchObject({ state: 'running', startedAt: 1_000 });
    expect(states(run)).toEqual(['active', ...Array(6).fill('waiting')]);
    expect(texts(run, 'news')).toEqual(['Starting run…']);
  });

  it('clears the previous run when the next one starts', () => {
    const finished = finishRun(
      apply(started(), [{ step: 'sign', text: 'signed', transaction: swap }]),
      { error: 'boom' },
      2_000,
    );
    const next = startRun(finished, 3_000);
    expect(next).toMatchObject({
      startedAt: 3_000,
      finishedAt: null,
      error: null,
      transaction: null,
      depositHash: null,
    });
    expect(texts(next, 'sign')).toEqual([]);
  });

  it('replays steps 4–6 per transaction and keeps every earlier entry', () => {
    const redeem = { kind: 'redeem', index: 2, total: 5 } as const;
    const run = apply(started(), [
      { step: 'compose', text: 'compose redeem', transaction: redeem },
      { step: 'sign', text: 'sign redeem', transaction: redeem },
      { step: 'confirm', text: 'confirm redeem', transaction: redeem },
      { step: 'compose', text: 'compose swap', transaction: swap },
    ]);
    expect(states(run)).toEqual([
      'done',
      'done',
      'done',
      'active',
      'waiting',
      'waiting',
      'waiting',
    ]);
    expect(texts(run, 'compose')).toEqual(['compose redeem', 'compose swap']);
    expect(texts(run, 'confirm')).toEqual(['confirm redeem']);
    expect(run.transaction).toEqual(swap);
  });

  it('never has more than one active step', () => {
    let run = started();
    for (const step of [...AGENT_RUN_STEP_IDS, 'compose', 'analyze'] as const) {
      run = applyProgress(run, { step, text: step });
      expect(states(run).filter((state) => state === 'active')).toHaveLength(1);
      expect(run.steps[step].state).toBe('active');
    }
  });

  it('records only the deposit hash, from its broadcast on', () => {
    const run = apply(started(), [
      { step: 'sign', text: 'swap sent', transaction: swap, hash },
      { step: 'confirm', text: 'waiting', transaction: swap },
    ]);
    expect(run.depositHash).toBeNull();
    const broadcast = applyProgress(run, {
      step: 'sign',
      text: 'deposit sent',
      transaction: deposit,
      hash,
    });
    expect(broadcast.depositHash).toBe(hash);
    // Steps without a transaction (deliver) keep the last one.
    expect(
      applyProgress(broadcast, { step: 'deliver', text: 'sent' }),
    ).toMatchObject({ transaction: deposit, depositHash: hash });
  });

  it('keeps only https links and copies no extra fields', () => {
    const run = apply(started(), [
      {
        step: 'intent',
        text: 'Tenderly simulation 1/2',
        link: {
          label: 'Tenderly',
          url: 'https://dashboard.tenderly.co/shared/simulation/1',
          extra: true,
        } as DemoProgress['link'],
      },
      {
        step: 'intent',
        text: 'Tenderly simulation 2/2',
        link: { label: 'Tenderly', url: 'http://insecure.example' },
      },
      { step: 'intent', text: 'bad', link: { label: 'x', url: 'not a url' } },
      {
        step: 'compose',
        text: 'compose',
        transaction: { ...swap, extra: 1 } as DemoProgress['transaction'],
      },
    ]);
    expect(run.steps.intent.entries.map((entry) => entry.link)).toEqual([
      {
        label: 'Tenderly',
        url: 'https://dashboard.tenderly.co/shared/simulation/1',
      },
      null,
      null,
    ]);
    expect(AgentRunStatusSchema.parse(run)).toEqual(run);
  });

  it('marks every step done when the run confirms', () => {
    const run = finishRun(
      apply(started(), [{ step: 'deliver', text: 'Telegram sent' }]),
      { outcome: 'confirmed' },
      9_000,
    );
    expect(run).toMatchObject({
      state: 'succeeded',
      finishedAt: 9_000,
      error: null,
    });
    expect(states(run)).toEqual(Array(7).fill('done'));
  });

  it('fails the active step with the guard reason when blocked', () => {
    const run = finishRun(
      apply(started(), [
        { step: 'intent', text: 'Review failed' },
        {
          step: 'intent',
          text: 'Blocked: Review did not pass. Nothing was signed.',
        },
      ]),
      { outcome: 'blocked' },
      2_000,
    );
    expect(run).toMatchObject({
      state: 'failed',
      error: 'Blocked: Review did not pass. Nothing was signed.',
    });
    expect(states(run)).toEqual([
      'done',
      'done',
      'failed',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ]);
  });

  it.each([
    ['dry-run', 'Dry-run stopped before signing; serve always executes'],
    ['replayed', 'Replay sent no transaction; serve always executes'],
  ] as const)('treats a %s outcome as a failure', (outcome, error) => {
    const run = finishRun(started(), { outcome }, 2_000);
    expect(run).toMatchObject({ state: 'failed', error });
    expect(run.steps.news.state).toBe('failed');
  });

  it('fails the active step with the error and keeps the deposit hash', () => {
    const run = finishRun(
      apply(started(), [
        { step: 'sign', text: 'sent', transaction: deposit, hash },
        { step: 'confirm', text: 'waiting', transaction: deposit },
      ]),
      { error: 'Error: deposit reverted on-chain' },
      2_000,
    );
    expect(run).toMatchObject({
      state: 'failed',
      error: 'Error: deposit reverted on-chain',
      depositHash: hash,
    });
    expect(run.steps.confirm.state).toBe('failed');
    expect(run.steps.sign.state).toBe('done');
  });

  it('ignores progress and results outside a running run', () => {
    const idle = idleRunStatus(EPISODE);
    expect(applyProgress(idle, { step: 'news', text: 'x' })).toBe(idle);
    expect(finishRun(idle, { outcome: 'confirmed' }, 1)).toBe(idle);
    const done = finishRun(started(), { outcome: 'confirmed' }, 2);
    expect(applyProgress(done, { step: 'deliver', text: 'late' })).toBe(done);
    expect(finishRun(done, { error: 'late' }, 3)).toBe(done);
  });

  it('falls back to a generic block message without a reason', () => {
    const run = startRun(idleRunStatus(EPISODE), 1);
    const blocked = finishRun(
      {
        ...run,
        steps: { ...run.steps, news: { state: 'active', entries: [] } },
      },
      { outcome: 'blocked' },
      2,
    );
    expect(blocked.error).toBe('Blocked. Nothing was signed.');
  });
});
