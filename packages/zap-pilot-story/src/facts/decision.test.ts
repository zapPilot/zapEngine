import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from './data/verifiable-strategy.json' with { type: 'json' };
import { engineDecision } from './decision.js';

const RECORDED = raw.examples[0]!;

async function traceFor(examples: unknown[]) {
  vi.resetModules();
  vi.doMock('./data/verifiable-strategy.json', () => ({
    default: { examples },
  }));
  return (await import('./decision.js')).engineDecision();
}

afterEach(() => {
  vi.doUnmock('./data/verifiable-strategy.json');
  vi.resetModules();
});

describe('engineDecision', () => {
  it('replays the recorded cross-down exit from the committed export', () => {
    const trace = engineDecision();
    expect(trace.date).toBe(RECORDED.date);
    expect(trace.observation).toBe('BTC closed below its 200-day average');
    expect(Number(trace.stablePercent) + Number(trace.spyPercent)).toBeCloseTo(
      100,
      2,
    );
    expect(trace.stablePercent).toBe(
      (Number(RECORDED.expected.publishedTarget[3]) * 100).toFixed(2),
    );
  });

  it('names every asset that crossed when more than one did', async () => {
    const trace = await traceFor([
      {
        ...RECORDED,
        expected: { ...RECORDED.expected, triggerMask: 6 },
      },
    ]);
    expect(trace.observation).toBe(
      'BTC and ETH closed below their 200-day averages',
    );
  });

  it('fails loudly when the export has no recorded cross-down exit', async () => {
    await expect(
      traceFor([{ ...RECORDED, publishedEvent: { reason: 'portfolio_hold' } }]),
    ).rejects.toThrow('no recorded cross-down exit');
  });
});
