import { wadToPercent } from '@/lib/verifiable-strategy/encoding';
import { verdict } from '@/lib/verifiable-strategy/verdict';
import type {
  CalculatorInput,
  CalculatorResult,
  Dataset,
  Example,
} from '@/lib/verifiable-strategy/types';
import { AllocationPreview } from './AllocationPreview';
import { VerifyYourself } from './VerifyYourself';

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
  const match =
    result &&
    historical &&
    !stale &&
    result.exit.matched &&
    !result.exit.cooled_off &&
    result.exit.target.length === example.expected.pyrevmTarget.length &&
    result.exit.target.every(
      (v, i) => v.toString() === example.expected.pyrevmTarget[i],
    ) &&
    result.exit.trigger_mask === example.expected.triggerMask &&
    result.exit.exit_mask === example.expected.exitMask &&
    result.exit.liquidated_mask === example.expected.liquidatedMask;
  return (
    <aside
      className="track-record-calculator-answer"
      aria-live="polite"
      aria-busy={running}
    >
      <h2>Contract answer</h2>
      {!data.deployment && (
        <>
          <p className="track-record-calculator-verdict">
            Ready when the contract is.
          </p>
          <p>
            Contract not deployed yet. Calls open once it’s live on Arbitrum
            Sepolia. You can already edit every input.
          </p>
          <p className="track-record-calculator-backtest">
            <strong>Python backtest event</strong>
            <br />
            On {example.date} the Python backtest moved{' '}
            {example.publishedEvent.fromAssets.join(' and ')} (
            {example.publishedEvent.amountPercent.toFixed(2)}%) to stablecoins.
            This is a backtest result, not an on-chain answer.
          </p>
        </>
      )}
      {data.deployment && !result && (
        <p>
          Edit the inputs, then call the deployed contract to see its answer.
        </p>
      )}
      {stale && <p>Previous answer — inputs changed</p>}
      {result && answer && (
        <div className={stale ? 'track-record-calculator-stale' : ''}>
          <p className="track-record-calculator-verdict">{answer.title}</p>
          <p>{answer.reason}</p>
          {submitted && (
            <>
              <h3>Before</h3>
              <AllocationPreview
                values={submitted.allocation}
                label="Submitted allocation before"
              />
            </>
          )}
          <h3>
            {result.exit.matched && !result.exit.cooled_off
              ? 'After'
              : 'Candidate target (no executable exit)'}
          </h3>
          <AllocationPreview
            values={result.exit.target.map(wadToPercent)}
            label="Contract target allocation"
          />
          {match && (
            <p className="track-record-calculator-match">
              ✓ Same result as the Python backtest
            </p>
          )}
          {!stale && !historical && (
            <p>Custom inputs — no historical-match claim.</p>
          )}
          {!stale && historical && !match && (
            <p>Does not match the published decision.</p>
          )}
          <p>
            {result.steps.length} calls · block {result.blockNumber.toString()}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="track-record-calculator-error">
          {error}
        </p>
      )}
      <button
        className="track-record-calculator-button"
        form="strategy-calculator"
        type="submit"
        disabled={disabled || running}
      >
        {running ? 'Calling Arbitrum Sepolia…' : 'Call contract'}
      </button>
      {result && data.deployment && (
        <details>
          <summary>
            Verify it yourself (cast / curl){stale ? ' — previous inputs' : ''}
          </summary>
          <VerifyYourself result={result} deployment={data.deployment} />
        </details>
      )}
    </aside>
  );
}
