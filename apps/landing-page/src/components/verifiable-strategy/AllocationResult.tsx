import {
  ALLOCATION_ASSETS,
  wadToPercent,
} from '@/lib/verifiable-strategy/encoding';
import type {
  CalculatorResult,
  Example,
} from '@/lib/verifiable-strategy/types';

export function AllocationResult({
  result,
  example,
  edited,
}: {
  result: CalculatorResult;
  example: Example;
  edited: boolean;
}) {
  const match =
    !edited &&
    result.exit.matched &&
    !result.exit.cooled_off &&
    result.exit.target.every(
      (value, i) => value.toString() === example.expected.pyrevmTarget[i],
    ) &&
    result.exit.trigger_mask === example.expected.triggerMask &&
    result.exit.exit_mask === example.expected.exitMask &&
    result.exit.liquidated_mask === example.expected.liquidatedMask;
  return (
    <section className="track-record-calculator-card" aria-live="polite">
      <h2>3. Compare the allocation</h2>
      {!result.exit.matched || result.exit.cooled_off ? (
        <p role="status">
          No executable exit:{' '}
          {result.exit.cooled_off
            ? 'rule cooldown is active'
            : 'cross_down_exit did not match'}
          . The values below are the slice’s candidate target, not a trading
          instruction.
        </p>
      ) : null}
      <dl className="track-record-calculator-weights">
        {result.exit.target.map((value, i) => (
          <div key={ALLOCATION_ASSETS[i]}>
            <dt>{ALLOCATION_ASSETS[i]}</dt>
            <dd>{wadToPercent(value)}%</dd>
          </div>
        ))}
      </dl>
      <p className={match ? 'track-record-calculator-match' : ''}>
        {match
          ? `Matches the published ${example.date} decision ✓`
          : edited
            ? 'Custom inputs — no historical-match claim.'
            : 'Does not match the published decision.'}
      </p>
      <p>
        The match compares this exact target with the exported Python decision
        (per-asset tolerance 1e-12). The published event is a backtest record,
        not proof of a production trade.
      </p>
    </section>
  );
}
