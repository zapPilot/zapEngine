'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DEFAULT_EXAMPLE_DATE,
  strategyData,
} from '@/config/verifiable-strategy';
import { inputFromExample } from '@/lib/verifiable-strategy/encoding';
import {
  calculatorClient,
  runCalculator,
  verifyDeployment,
} from '@/lib/verifiable-strategy/onchain';
import type {
  CalculatorInput,
  CalculatorResult,
  Dataset,
  Example,
} from '@/lib/verifiable-strategy/types';
import { AllocationResult } from './AllocationResult';
import { CalculatorForm } from './CalculatorForm';
import { CalculatorSteps } from './CalculatorSteps';
import { ContractIdentityCard } from './ContractIdentityCard';
import { VerifyYourself } from './VerifyYourself';

function ExampleCalculator({
  example,
  data,
}: {
  example: Example;
  data: Dataset;
}) {
  const original = inputFromExample(example);
  const [input, setInput] = useState(original);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle',
  );
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [error, setError] = useState('');
  const edited = JSON.stringify(input) !== JSON.stringify(original);
  function change(value: CalculatorInput) {
    setInput(value);
    setResult(null);
    setState('idle');
    setError('');
  }
  async function run() {
    setState('running');
    setResult(null);
    setError('');
    try {
      setResult(await runCalculator(input, data));
      setState('done');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'RPC calculation failed',
      );
      setState('error');
    }
  }
  return (
    <>
      <p>
        Historical example: <strong>{example.date}</strong> ·{' '}
        <a href="/track-record/rebalances/">Published backtest events ↗</a>
      </p>
      <CalculatorForm
        input={input}
        onChange={change}
        running={state === 'running'}
        onRun={() => void run()}
      />
      {edited && (
        <button
          type="button"
          onClick={() => change(original)}
          disabled={state === 'running'}
        >
          Restore historical inputs
        </button>
      )}
      {state === 'error' && <p role="alert">{error}</p>}
      {state === 'done' && result && (
        <>
          <CalculatorSteps result={result} />
          <AllocationResult result={result} example={example} edited={edited} />
          <VerifyYourself result={result} deployment={data.deployment!} />
        </>
      )}
      <details className="track-record-calculator-card">
        <summary>Example provenance & Python target</summary>
        <pre>
          {JSON.stringify(
            {
              provenance: example.provenance,
              publishedEvent: example.publishedEvent,
              expected: example.expected,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </>
  );
}

export function StrategyCalculator({
  data = strategyData,
}: {
  data?: Dataset;
}) {
  const requested = useSearchParams().get('date') ?? DEFAULT_EXAMPLE_DATE;
  const example = data.examples.find((value) => value.date === requested);
  const [verification, setVerification] = useState(
    data.deployment ? 'Checking deployed bytecode…' : 'Not deployed yet',
  );
  useEffect(() => {
    if (!data.deployment) return;
    let active = true;
    void verifyDeployment(calculatorClient(), data)
      .then(({ blockNumber }) => {
        if (active) setVerification(`Codehash matches at block ${blockNumber}`);
      })
      .catch((cause: unknown) => {
        if (active)
          setVerification(
            cause instanceof Error ? cause.message : 'Bytecode check failed',
          );
      });
    return () => {
      active = false;
    };
  }, [data]);
  return (
    <div className="track-record-calculator">
      <p className="track-record-calculator-eyebrow">
        Verifiable strategy · Research demonstration
      </p>
      <h1>On-chain Strategy Calculator</h1>
      <p>
        Recompute one historical exit with public, immutable Vyper bytecode.
        Read-only calls. No wallet required.
      </p>
      <ContractIdentityCard data={data} verification={verification} />
      {!data.deployment ? (
        <section className="track-record-calculator-card" role="status">
          <h2>Not deployed yet</h2>
          <p>
            The research slice has not been deployed to Arbitrum Sepolia. The
            2025-10-18 example will appear after its real inputs and Python
            result have been verified. No simulated chain result is shown.
          </p>
        </section>
      ) : example ? (
        <ExampleCalculator key={example.date} example={example} data={data} />
      ) : (
        <p role="status">
          No verified historical example is available for {requested}.
        </p>
      )}
      <section className="track-record-calculator-card track-record-calculator-grid">
        <div>
          <h2>What this proves</h2>
          <p>
            For these exact inputs, the deployed bytecode with the displayed
            codehash produces this allocation.
          </p>
        </div>
        <div>
          <h2>What this doesn’t prove</h2>
          <p>
            It does not authenticate price or DMA data, prior state, or
            production execution. The example discloses its state assumptions
            and data provenance. This covers one of six rules and is not the
            production strategy.
          </p>
        </div>
      </section>
      <p>
        <Link href="/docs/track-record/verifiable-strategy/">
          Read the verification method and limitations →
        </Link>
      </p>
    </div>
  );
}
