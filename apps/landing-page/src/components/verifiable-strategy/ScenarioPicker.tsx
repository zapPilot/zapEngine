import { SCENARIOS, type Scenario } from '@/lib/verifiable-strategy/scenarios';
export function ScenarioPicker({
  date,
  selected,
  disabled,
  onSelect,
}: {
  date: string;
  selected: Scenario | null;
  disabled: boolean;
  onSelect: (scenario: Scenario) => void;
}) {
  return (
    <div
      className="track-record-calculator-scenarios"
      aria-label="Try a scenario"
    >
      <span>Try a scenario</span>
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
  );
}
