import { ASSETS } from '@/lib/verifiable-strategy/encoding';
import type { CalculatorResult } from '@/lib/verifiable-strategy/types';

const zones = ['missing', 'above', 'below', 'at'];
const crosses = ['none', 'down', 'up'];
export function CalculatorSteps({ result }: { result: CalculatorResult }) {
  const names = (mask: number) =>
    ASSETS.filter((_, i) => (mask & (1 << i)) !== 0).join(', ') || 'none';
  return (
    <section className="track-record-calculator-card">
      <h2>2. Follow the bytecode</h2>
      <p>
        Three read-only calls at block {result.blockNumber.toString()}: warmup →
        observe → cross_down_exit.
      </p>
      <div className="track-record-calculator-scroll">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Warmup zone</th>
              <th>Current zone</th>
              <th>Observed cross</th>
              <th>Actionable cross</th>
              <th>DMA cooldown</th>
            </tr>
          </thead>
          <tbody>
            {result.views.map((view, i) => (
              <tr key={ASSETS[i]}>
                <th>{ASSETS[i]}</th>
                <td>{zones[result.warmup[i]!.observed]}</td>
                <td>{zones[view.zone]}</td>
                <td>{crosses[view.cross]}</td>
                <td>{crosses[view.actionable_cross]}</td>
                <td>
                  {view.active ? `${view.remaining} days (active)` : 'inactive'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Trigger: {names(result.exit.trigger_mask)} · Exit:{' '}
        {names(result.exit.exit_mask)} · Liquidated:{' '}
        {names(result.exit.liquidated_mask)}
      </p>
      <p>
        Rule cooldown:{' '}
        {result.exit.cooled_off
          ? `${result.exit.remaining_days} days remaining`
          : 'inactive'}
        .
      </p>
    </section>
  );
}
