import { describe, expect, it } from 'vitest';

import {
  AGENT_RUN_STEP_IDS,
  AgentRunStatusSchema,
} from '../../../src/api/agent-run.js';

const waiting = { state: 'waiting', entries: [] };
const steps = Object.fromEntries(AGENT_RUN_STEP_IDS.map((id) => [id, waiting]));

const running = {
  state: 'running',
  episode: '0f85db1e-ae06-45ea-89a7-360ec63ff072',
  startedAt: 1_000,
  finishedAt: null,
  error: null,
  transaction: { kind: 'swap', index: 3, total: 5 },
  depositHash: `0x${'ab'.repeat(32)}`,
  steps: {
    ...steps,
    news: { state: 'done', entries: [{ text: 'Bitget hacked', link: null }] },
    intent: {
      state: 'done',
      entries: [
        {
          text: 'Tenderly simulation 1/1',
          link: {
            label: 'Tenderly',
            url: 'https://dashboard.tenderly.co/shared/simulation/1',
          },
        },
      ],
    },
    sign: { state: 'active', entries: [] },
  },
};

const withLink = (url: string) => ({
  ...running,
  steps: {
    ...running.steps,
    sign: {
      state: 'active',
      entries: [{ text: 'Broadcast', link: { label: 'Basescan', url } }],
    },
  },
});

describe('AgentRunStatusSchema', () => {
  it('accepts an idle status and a run in progress', () => {
    expect(
      AgentRunStatusSchema.safeParse({
        ...running,
        state: 'idle',
        startedAt: null,
        transaction: null,
        depositHash: null,
        steps,
      }).success,
    ).toBe(true);
    expect(AgentRunStatusSchema.safeParse(running).success).toBe(true);
  });

  it('accepts only https links', () => {
    expect(
      AgentRunStatusSchema.safeParse(withLink('https://basescan.org/tx/0x1'))
        .success,
    ).toBe(true);
    for (const url of [
      'http://basescan.org/tx/0x1',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(AgentRunStatusSchema.safeParse(withLink(url)).success).toBe(false);
    }
  });

  it.each([
    ['a missing step', { steps: { ...steps, deliver: undefined } }],
    ['an unknown step', { steps: { ...steps, extra: waiting } }],
    ['an unknown state', { state: 'queued' }],
    [
      'a transaction past its total',
      { transaction: { kind: 'swap', index: 6, total: 5 } },
    ],
    [
      'an unknown transaction kind',
      { transaction: { kind: 'bridge', index: 1, total: 5 } },
    ],
    ['a malformed deposit hash', { depositHash: '0x1234' }],
    ['an unknown field', { outcome: 'confirmed' }],
  ])('rejects %s', (_, override) => {
    expect(
      AgentRunStatusSchema.safeParse({ ...running, ...override }).success,
    ).toBe(false);
  });
});
