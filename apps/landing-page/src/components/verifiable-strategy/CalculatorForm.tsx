import { ALLOCATION_ASSETS, ASSETS } from '@/lib/verifiable-strategy/encoding';
import type { CalculatorInput } from '@/lib/verifiable-strategy/types';

export function CalculatorForm({
  input,
  onChange,
  running,
  onRun,
}: {
  input: CalculatorInput;
  onChange: (value: CalculatorInput) => void;
  running: boolean;
  onRun: () => void;
}) {
  function setObservation(
    period: 'previous' | 'current',
    index: number,
    field: 'price' | 'dma',
    value: string,
  ) {
    onChange({
      ...input,
      [period]: input[period].map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    });
  }
  return (
    <form
      className="track-record-calculator-card"
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <h2>1. Inspect the inputs</h2>
      <p>
        USD prices and 200-day moving averages. Decimal strings are encoded
        directly to WAD. Zero means missing data.
      </p>
      <fieldset disabled={running}>
        <legend>Market observations</legend>
        <div className="track-record-calculator-grid">
          {(['previous', 'current'] as const).map((period) => (
            <section key={period}>
              <h3>
                {period === 'previous'
                  ? `Previous day · ${input.previousDate}`
                  : `Decision day · ${input.date}`}
              </h3>
              {ASSETS.map((asset, index) => (
                <div className="track-record-calculator-input-row" key={asset}>
                  {(['price', 'dma'] as const).map((field) => (
                    <label key={field}>
                      {asset} {field === 'dma' ? 'DMA-200' : 'price'}
                      <input
                        aria-label={`${period} ${asset} ${field}`}
                        inputMode="decimal"
                        value={input[period][index]![field]}
                        onChange={(event) =>
                          setObservation(
                            period,
                            index,
                            field,
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
        <h3>Decision-time allocation (%)</h3>
        <div className="track-record-calculator-weights">
          {ALLOCATION_ASSETS.map((asset, index) => (
            <label key={asset}>
              {asset}
              <input
                aria-label={`${asset} allocation percent`}
                inputMode="decimal"
                value={input.allocation[index]}
                onChange={(event) =>
                  onChange({
                    ...input,
                    allocation: input.allocation.map((value, i) =>
                      i === index ? event.target.value : value,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="track-record-calculator-check">
          <input
            type="checkbox"
            checked={input.crossOnTouch}
            onChange={(event) =>
              onChange({ ...input, crossOnTouch: event.target.checked })
            }
          />{' '}
          Count touching DMA as a cross
        </label>
        <p>
          Last executed exit:{' '}
          {input.lastExecutedDay === 0
            ? 'none'
            : new Date(input.lastExecutedDay * 86400000)
                .toISOString()
                .slice(0, 10)}
          .
        </p>
        {input.stateMode === 'warmup' ? (
          <p>
            No active DMA cooldown in this example. Prior zones are derived from
            the previous day.
          </p>
        ) : (
          <div role="note">
            <strong>This example requires explicit historical state.</strong>
            <p>
              Warmup alone cannot reproduce its state. Observe uses the
              published prior state below; its honesty is not proven on-chain.
            </p>
            <pre>{JSON.stringify(input.priorStates)}</pre>
          </div>
        )}
        <button className="track-record-calculator-button" type="submit">
          {running ? 'Calling Arbitrum Sepolia…' : 'Run on-chain calculation'}
        </button>
      </fieldset>
    </form>
  );
}
