import { MarkerGlyph } from '@/components/track-record/chartMarkers';
import {
  ASSETS,
  decimalToWad,
  foldAllocation,
  wadToPercent,
} from '@/lib/verifiable-strategy/encoding';
import { assetOutcome, verdict } from '@/lib/verifiable-strategy/verdict';
import type {
  CalculatorInput,
  CalculatorResult,
  Dataset,
  Example,
} from '@/lib/verifiable-strategy/types';
import { AllocationCompare } from './AllocationPreview';
import { VerifyYourself } from './VerifyYourself';

const OUTCOME_ORDER = [1, 2, 0] as const;

function BacktestReference({ example }: { example: Example }) {
  const event = example.publishedEvent;
  return (
    <section className="calc-reference" aria-label="Python backtest reference">
      <h3>Python backtest on {example.date}</h3>
      <p>
        It moved {event.fromAssets.join(' and ')} (
        {event.amountPercent.toFixed(2)}% of the portfolio) to stablecoins. This
        is the published backtest, not a contract answer.
      </p>
      <AllocationCompare
        before={foldAllocation(
          example.allocation.map((value) => wadToPercent(BigInt(value.wad))),
        )}
        after={example.expected.pythonTarget.map(decimalToWad)}
      />
    </section>
  );
}

export function ContractAnswer({
  result,
  submitted,
  example,
  data,
  stale,
  historical,
  running,
  disabled,
  error,
}: {
  result: CalculatorResult | null;
  submitted: CalculatorInput | null;
  example: Example;
  data: Dataset;
  stale: boolean;
  historical: boolean;
  running: boolean;
  disabled: boolean;
  error: string;
}) {
  const answer = result ? verdict(result.exit) : null;
  const executable = !!result?.exit.matched && !result.exit.cooled_off;
  const match =
    result &&
    historical &&
    !stale &&
    executable &&
    result.exit.target.length === example.expected.pyrevmTarget.length &&
    result.exit.target.every(
      (v, i) => v.toString() === example.expected.pyrevmTarget[i],
    ) &&
    result.exit.trigger_mask === example.expected.triggerMask &&
    result.exit.exit_mask === example.expected.exitMask &&
    result.exit.liquidated_mask === example.expected.liquidatedMask;
  const [status, tone] = running
    ? ['Calling…', 'busy']
    : error
      ? ['Call failed', 'error']
      : stale
        ? ['Inputs changed', 'muted']
        : result
          ? [`Block ${result.blockNumber.toString()}`, 'done']
          : data.deployment
            ? ['Ready', 'done']
            : ['Not deployed', 'muted'];
  return (
    <aside className="calc-answer" aria-live="polite" aria-busy={running}>
      <header className="calc-answer-head">
        <h2>Contract answer</h2>
        <span className="calc-status" data-tone={tone}>
          {status}
        </span>
      </header>
      {result && answer ? (
        <div
          className={stale ? 'calc-answer-body calc-stale' : 'calc-answer-body'}
        >
          {stale && (
            <p className="calc-stale-note">Previous answer — inputs changed</p>
          )}
          <p className="calc-verdict">{answer.title}</p>
          <p className="calc-reason">{answer.reason}</p>
          {submitted && result.exit.matched ? (
            <AllocationCompare
              before={foldAllocation(submitted.allocation)}
              after={result.exit.target}
              afterLabel={executable ? 'After' : 'If ready'}
            />
          ) : (
            <p className="calc-footnote">The allocation stays as entered.</p>
          )}
          <ul className="calc-outcomes">
            {OUTCOME_ORDER.map((index) => {
              const outcome = assetOutcome(
                result.views[index]!,
                index,
                result.exit,
              );
              const asset = ASSETS[index];
              return (
                <li
                  key={asset}
                  style={{ color: `var(--event-${asset.toLowerCase()})` }}
                >
                  <b>
                    {asset}
                    {outcome.crossedDown && <MarkerGlyph action="sell" />}
                  </b>
                  <span>{outcome.text}</span>
                </li>
              );
            })}
          </ul>
          {!stale && match && (
            <p className="calc-match">✓ Same result as the Python backtest</p>
          )}
          {!stale && !historical && (
            <p className="calc-footnote">
              Custom inputs, so there is no historical comparison.
            </p>
          )}
          {!stale && historical && !match && (
            <p className="calc-footnote">
              Does not match the published decision.
            </p>
          )}
          <p className="calc-receipt">
            {result.steps.length} read-only calls at block{' '}
            {result.blockNumber.toString()}
          </p>
        </div>
      ) : (
        <div className="calc-answer-body">
          <p className="calc-verdict">
            {running
              ? 'Asking the contract…'
              : data.deployment
                ? 'Ready to call.'
                : 'Waiting for deployment.'}
          </p>
          <p className="calc-reason">
            {running
              ? 'Three read-only calls to Arbitrum Sepolia: warmup, observe, then cross_down_exit.'
              : data.deployment
                ? 'Send these inputs to the deployed contract to see what it decides.'
                : 'Contract not deployed yet. Calls open once it’s live on Arbitrum Sepolia. Every input already works.'}
          </p>
          <BacktestReference example={example} />
        </div>
      )}
      {error && (
        <p role="alert" className="calc-error">
          {error}
        </p>
      )}
      <button
        className="calc-call"
        form="strategy-calculator"
        type="submit"
        disabled={disabled || running}
      >
        {running ? 'Calling Arbitrum Sepolia…' : 'Call contract'}
      </button>
      {result && data.deployment && (
        <details className="calc-verify">
          <summary>
            Verify it yourself{stale ? ' (previous inputs)' : ''}
          </summary>
          <VerifyYourself result={result} deployment={data.deployment} />
        </details>
      )}
    </aside>
  );
}
