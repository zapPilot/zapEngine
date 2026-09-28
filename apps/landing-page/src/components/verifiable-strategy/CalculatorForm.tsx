import {
  ALLOCATION_ASSETS,
  ASSETS,
  dateFromDay,
  dayFromDate,
  validateInput,
} from '@/lib/verifiable-strategy/encoding';
import type {
  CalculatorInput,
  CalculatorResult,
} from '@/lib/verifiable-strategy/types';
import { AllocationPreview } from './AllocationPreview';
import { AssetCrossTrack } from './AssetCrossTrack';

export function CalculatorForm({
  input,
  onChange,
  running,
  onRun,
  result,
}: {
  input: CalculatorInput;
  onChange: (value: CalculatorInput) => void;
  running: boolean;
  onRun: () => void;
  result?: CalculatorResult;
}) {
  const errors = validateInput(input);
  function field(
    key: string,
    label: string,
    value: string,
    update: (value: string) => void,
    type = 'text',
  ) {
    return (
      <label>
        {label
          .replace(/^previous (BTC|ETH|SPY) /, 'Yesterday ')
          .replace(/^current (BTC|ETH|SPY) /, 'Today ')
          .replace(/dma$/, '200-day average')}
        <input
          type={type}
          aria-label={label}
          inputMode={type === 'text' ? 'decimal' : undefined}
          value={value}
          aria-invalid={!!errors[key]}
          aria-describedby={
            [
              errors[key] ? `error-${key}` : '',
              key.startsWith('allocation.') ? 'allocation-total' : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(e) => update(e.target.value)}
        />
        {errors[key] && (
          <small className="track-record-calculator-error" id={`error-${key}`}>
            {errors[key]}
          </small>
        )}
      </label>
    );
  }
  function observation(
    period: 'previous' | 'current',
    index: number,
    key: 'price' | 'dma',
    value: string,
  ) {
    onChange({
      ...input,
      [period]: input[period].map((row, i) =>
        i === index ? { ...row, [key]: value } : row,
      ),
    });
  }
  return (
    <form
      id="strategy-calculator"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!Object.keys(errors).length) onRun();
      }}
    >
      <h2>Inputs</h2>
      <p>USD prices and 200-day averages. Zero means missing data.</p>
      <fieldset disabled={running}>
        <legend className="sr-only">Decision inputs</legend>
        <div className="track-record-calculator-input-row">
          {field(
            'date',
            'Decision day',
            input.date,
            (value) => onChange({ ...input, date: value }),
            'date',
          )}
          {field(
            'previousDate',
            'Previous day',
            input.previousDate,
            (value) => onChange({ ...input, previousDate: value }),
            'date',
          )}
        </div>
        {[1, 2, 0].map((index) => (
          <section
            className="track-record-calculator-asset"
            key={ASSETS[index]}
          >
            <AssetCrossTrack
              asset={ASSETS[index]!}
              previous={input.previous[index]!}
              current={input.current[index]!}
              view={result?.views[index]}
            />
            {(['previous', 'current'] as const).map((period) => (
              <div key={period} className="track-record-calculator-input-row">
                {(['price', 'dma'] as const).map((key) => (
                  <div key={key}>
                    {field(
                      `${period}.${index}.${key}`,
                      `${period} ${ASSETS[index]} ${key}`,
                      input[period][index]![key],
                      (value) => observation(period, index, key, value),
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
        <section className="track-record-calculator-asset">
          <h3>Allocation before the decision</h3>
          <AllocationPreview
            values={input.allocation}
            label="Allocation before the decision"
          />
          <div className="track-record-calculator-weights">
            {ALLOCATION_ASSETS.map((asset, index) => (
              <div key={asset}>
                {field(
                  `allocation.${index}`,
                  `${asset} allocation percent`,
                  input.allocation[index]!,
                  (value) =>
                    onChange({
                      ...input,
                      allocation: input.allocation.map((old, i) =>
                        i === index ? value : old,
                      ),
                    }),
                )}
              </div>
            ))}
          </div>
          <p
            id="allocation-total"
            className={
              errors['allocation']
                ? 'track-record-calculator-error'
                : 'track-record-calculator-match'
            }
          >
            {errors['allocation'] ?? 'Total 100% ✓'}
          </p>
        </section>
        <label className="track-record-calculator-check">
          <input
            type="checkbox"
            checked={input.crossOnTouch}
            onChange={(e) =>
              onChange({ ...input, crossOnTouch: e.target.checked })
            }
          />
          Count touching the line as a cross
        </label>
        {field(
          'lastExecutedDay',
          'Last exit executed (blank means none)',
          dateFromDay(input.lastExecutedDay),
          (value) => {
            try {
              onChange({ ...input, lastExecutedDay: dayFromDate(value) });
            } catch {
              onChange({ ...input, lastExecutedDay: -1 });
            }
          },
          'date',
        )}
        {input.stateMode === 'explicit' ? (
          <div role="note">
            <strong>This example requires explicit historical state.</strong>
            <p>
              Observe uses the published prior state below; its honesty is not
              proven on-chain.
            </p>
            <pre>{JSON.stringify(input.priorStates)}</pre>
          </div>
        ) : (
          <p>
            Prior zones come from the previous day. No active DMA cooldown in
            the recorded starting state.
          </p>
        )}
      </fieldset>
    </form>
  );
}
