import { SCENARIOS, type Scenario } from '@/lib/verifiable-strategy/scenarios';

const DESCRIPTIONS: Record<Scenario, (date: string) => string> = {
  real: (date) =>
    `Recorded production inputs for ${date}. The Python backtest exited BTC and ETH that day.`,
  above: () => 'Same day, but BTC closes 1% above its 200-day average.',
  cooldown: () =>
    'Same prices, but the rule last exited ten days earlier, inside its 30-day wait.',
  touch: () =>
    'BTC closes exactly on its average. The touch setting under Rule state decides the result.',
};

export function ScenarioPicker({
  date,
  selected,
  edited,
  disabled,
  onSelect,
  onRestore,
}: {
  date: string;
  selected: Scenario | null;
  edited: boolean;
  disabled: boolean;
  onSelect: (scenario: Scenario) => void;
  onRestore: () => void;
}) {
  return (
    <section className="calc-scenarios" aria-labelledby="calc-scenario-title">
      <h2 id="calc-scenario-title">Scenario</h2>
      <div className="calc-segments" role="group" aria-label="Scenario">
        {SCENARIOS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === id}
            disabled={disabled}
            onClick={() => onSelect(id)}
          >
            {id === 'real' ? `${date} (real data)` : label}
          </button>
        ))}
      </div>
      <p className="calc-scenario-note">
        {selected
          ? DESCRIPTIONS[selected](date)
          : 'Custom inputs. Pick a scenario or restore the recorded day.'}
        {edited && (
          <button
            className="calc-link"
            type="button"
            disabled={disabled}
            onClick={onRestore}
          >
            Restore real inputs
          </button>
        )}
      </p>
    </section>
  );
}
