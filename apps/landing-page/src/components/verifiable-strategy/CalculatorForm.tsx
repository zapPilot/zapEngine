import { useState } from 'react';
import {
  ALLOCATION_ASSETS,
  ASSETS,
  dateFromDay,
  dayFromDate,
  displayDecimal,
  previousDate,
  validateInput,
} from '@/lib/verifiable-strategy/encoding';
import type { CalculatorInput } from '@/lib/verifiable-strategy/types';
import { AllocationPreview, allocationColor } from './AllocationPreview';
import { AssetCrossTrack } from './AssetCrossTrack';

const MARKET_ORDER = [1, 2, 0] as const;
const PERIODS = ['previous', 'current'] as const;
const FIELDS = ['price', 'dma'] as const;

const fieldLabel = (
  asset: string,
  period: (typeof PERIODS)[number],
  key: (typeof FIELDS)[number],
) =>
  `${asset} ${key === 'price' ? 'price' : '200-day average'} on ${period === 'current' ? 'decision day' : 'previous day'}`;

const shortDate = (date: string) => {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—';
};

/** Shows a rounded value at rest and every digit while editing. */
function DecimalInput({
  label,
  value,
  error,
  describedBy,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <input
      className="calc-input"
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      title={value}
      value={editing || error ? value : displayDecimal(value)}
      aria-invalid={!!error}
      aria-describedby={describedBy}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

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
  const errors = validateInput(input);
  const errorId = (key: string) =>
    errors[key] ? `error-${key.replaceAll('.', '-')}` : undefined;
  function observation(
    period: (typeof PERIODS)[number],
    index: number,
    key: (typeof FIELDS)[number],
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
      className="calc-inputs"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!Object.keys(errors).length) onRun();
      }}
    >
      <fieldset disabled={running}>
        <legend className="sr-only">Decision inputs</legend>

        <section className="calc-section" aria-labelledby="calc-market-title">
          <div className="calc-section-head">
            <div>
              <h2 id="calc-market-title">Market data</h2>
              <p>USD closes and 200-day averages. Zero means missing data.</p>
            </div>
            <label className="calc-date">
              Decision day
              <input
                type="date"
                value={input.date}
                aria-invalid={!!errors['date']}
                aria-describedby={errorId('date')}
                onChange={(event) =>
                  onChange({
                    ...input,
                    date: event.target.value,
                    previousDate: previousDate(event.target.value),
                  })
                }
              />
            </label>
          </div>
          {errors['date'] && (
            <small className="calc-error" id={errorId('date')}>
              {errors['date']}
            </small>
          )}
          <div className="calc-market">
            <div className="calc-market-head" aria-hidden="true">
              <span />
              <span />
              <span>Price</span>
              <span>200-day average</span>
              <span className="calc-legend">
                <i className="calc-legend-price" />
                Price
                <i className="calc-legend-average" />
                Average
              </span>
            </div>
            {MARKET_ORDER.map((index) => {
              const asset = ASSETS[index];
              const assetErrors = PERIODS.flatMap((period) =>
                FIELDS.map((key) => ({
                  key: `${period}.${index}.${key}`,
                  label: fieldLabel(asset, period, key),
                })),
              ).filter(({ key }) => errors[key]);
              return (
                <div
                  className="calc-asset"
                  key={asset}
                  role="group"
                  aria-label={asset}
                >
                  <strong
                    className="calc-asset-name"
                    style={{ color: `var(--event-${asset.toLowerCase()})` }}
                  >
                    {asset}
                  </strong>
                  {PERIODS.map((period) => [
                    <span className="calc-day" key={`${period}-day`}>
                      {shortDate(
                        period === 'current' ? input.date : input.previousDate,
                      )}
                    </span>,
                    ...FIELDS.map((key) => {
                      const id = `${period}.${index}.${key}`;
                      return (
                        <DecimalInput
                          key={id}
                          label={fieldLabel(asset, period, key)}
                          value={input[period][index]![key]}
                          error={errors[id]}
                          describedBy={errorId(id)}
                          onChange={(value) =>
                            observation(period, index, key, value)
                          }
                        />
                      );
                    }),
                  ])}
                  <AssetCrossTrack
                    asset={asset}
                    previous={input.previous[index]!}
                    current={input.current[index]!}
                  />
                  {assetErrors.map(({ key, label }) => (
                    <small className="calc-error" id={errorId(key)} key={key}>
                      {label}: {errors[key]}
                    </small>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="calc-footnote">
            Cells show two decimals; the contract receives every digit. Select a
            cell to see and edit the full value.
          </p>
        </section>

        <section
          className="calc-section"
          aria-labelledby="calc-portfolio-title"
        >
          <div className="calc-section-head">
            <div>
              <h2 id="calc-portfolio-title">Portfolio before the decision</h2>
              <p>Share of the portfolio in each bucket, in percent.</p>
            </div>
            <p
              id="allocation-total"
              className={errors['allocation'] ? 'calc-error' : 'calc-total'}
            >
              {errors['allocation'] ?? 'Total 100%'}
            </p>
          </div>
          <AllocationPreview
            values={input.allocation}
            label="Allocation before the decision"
          />
          <div className="calc-weights">
            {ALLOCATION_ASSETS.map((asset, index) => {
              const id = `allocation.${index}`;
              return (
                <label key={asset}>
                  <span>
                    <i
                      className="calc-swatch"
                      style={{ background: allocationColor(asset) }}
                    />
                    {asset}
                  </span>
                  <span className="calc-percent">
                    <DecimalInput
                      label={`${asset} allocation percent`}
                      value={input.allocation[index]!}
                      error={errors[id]}
                      describedBy={
                        [errorId(id), 'allocation-total']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      onChange={(value) =>
                        onChange({
                          ...input,
                          allocation: input.allocation.map((old, i) =>
                            i === index ? value : old,
                          ),
                        })
                      }
                    />
                  </span>
                  {errors[id] && (
                    <small className="calc-error" id={errorId(id)}>
                      {errors[id]}
                    </small>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        <section className="calc-section" aria-labelledby="calc-rule-title">
          <div className="calc-section-head">
            <div>
              <h2 id="calc-rule-title">Rule state</h2>
              <p>How the exit rule treats the line, and when it last fired.</p>
            </div>
          </div>
          <div className="calc-rule">
            <label className="calc-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={input.crossOnTouch}
                onChange={(event) =>
                  onChange({ ...input, crossOnTouch: event.target.checked })
                }
              />
              <span>Count touching the average as a cross</span>
            </label>
            <label className="calc-date">
              Last exit executed
              <input
                type="date"
                value={dateFromDay(input.lastExecutedDay)}
                aria-invalid={!!errors['lastExecutedDay']}
                aria-describedby={
                  errorId('lastExecutedDay') ?? 'last-exit-help'
                }
                onChange={(event) => {
                  try {
                    onChange({
                      ...input,
                      lastExecutedDay: dayFromDate(event.target.value),
                    });
                  } catch {
                    onChange({ ...input, lastExecutedDay: -1 });
                  }
                }}
              />
            </label>
          </div>
          {errors['lastExecutedDay'] ? (
            <small className="calc-error" id={errorId('lastExecutedDay')}>
              {errors['lastExecutedDay']}
            </small>
          ) : (
            <p className="calc-footnote" id="last-exit-help">
              Leave it blank if the rule has never exited. The rule waits 30
              days between exits.
            </p>
          )}
          {input.stateMode === 'explicit' ? (
            <div className="calc-note" role="note">
              <strong>This example requires explicit historical state.</strong>
              <p>
                Observe uses the published prior state below; its honesty is not
                proven on-chain.
              </p>
              <pre>{JSON.stringify(input.priorStates)}</pre>
            </div>
          ) : (
            <p className="calc-footnote">
              Yesterday’s closes set each asset’s starting side of the average.
              The recorded day starts with no DMA cooldown.
            </p>
          )}
        </section>
      </fieldset>
    </form>
  );
}
