'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DEFAULT_EXAMPLE_DATE,
  strategyData,
} from '@/config/verifiable-strategy';
import {
  inputFromExample,
  validateInput,
} from '@/lib/verifiable-strategy/encoding';
import {
  scenarioInput,
  type Scenario,
} from '@/lib/verifiable-strategy/scenarios';
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
import { ContractAnswer } from './ContractAnswer';
import { ScenarioPicker } from './ScenarioPicker';
import { CalculatorForm } from './CalculatorForm';
import { ContractIdentityCard } from './ContractIdentityCard';

function ExampleCalculator({
  example,
  data,
}: {
  example: Example;
  data: Dataset;
}) {
  const original = inputFromExample(example);
  const [input, setInput] = useState(original);
  const [scenario, setScenario] = useState<Scenario | null>('real');
  const [state, setState] = useState<
    'idle' | 'calling' | 'done' | 'stale' | 'error'
  >('idle');
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [submitted, setSubmitted] = useState<CalculatorInput | null>(null);
  const [error, setError] = useState('');
  const edited = JSON.stringify(input) !== JSON.stringify(original);
  const historical = scenario === 'real' && !edited;
  function change(value: CalculatorInput, selected: Scenario | null = null) {
    setInput(value);
    setScenario(selected);
    setState(result ? 'stale' : 'idle');
    setError('');
  }
  async function run() {
    if (
      !data.deployment ||
      state === 'calling' ||
      Object.keys(validateInput(input)).length
    )
      return;
    setState('calling');
    setResult(null);
    setError('');
    setSubmitted(input);
    try {
      setResult(await runCalculator(input, data));
      setState('done');
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'RPC calculation failed';
      const next = /codehash|bytecode|contract/i.test(message)
        ? 'Check the deployment address and pinned artifact before retrying.'
        : /network/i.test(message)
          ? 'Use an Arbitrum Sepolia RPC, then retry.'
          : 'Check your connection and retry the call.';
      setError(`${message} ${next}`);
      setState('error');
    }
  }
  return (
    <>
      <ScenarioPicker
        date={example.date}
        selected={scenario}
        edited={edited}
        disabled={state === 'calling'}
        onSelect={(selected) =>
          change(scenarioInput(example, selected), selected)
        }
        onRestore={() => change(original, 'real')}
      />
      <div className="calc-layout">
        <div className="calc-main">
          <CalculatorForm
            input={input}
            onChange={change}
            running={state === 'calling'}
            onRun={() => void run()}
          />
          <details className="calc-provenance">
            <summary>Recorded example provenance</summary>
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
        </div>
        <ContractAnswer
          result={result}
          submitted={submitted}
          example={example}
          data={data}
          stale={state === 'stale'}
          historical={historical}
          running={state === 'calling'}
          disabled={
            !data.deployment || !!Object.keys(validateInput(input)).length
          }
          error={error}
        />
      </div>
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
      <header className="calc-hero">
        <h1>On-chain calculator</h1>
        <p>
          Run one Zap Pilot exit rule on its public Vyper contract. Enter a day
          of prices, call the contract, and see the allocation it returns.
        </p>
        <p className="calc-disclosure">
          Research slice: 1 of 6 rules, not the production strategy
        </p>
      </header>
      <ContractIdentityCard data={data} verification={verification} />
      {example ? (
        <ExampleCalculator key={example.date} example={example} data={data} />
      ) : (
        <p role="status">
          No verified historical example is available for {requested}.
        </p>
      )}
      <section className="calc-limits">
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
      <p className="calc-doc-link">
        <Link href="/docs/track-record/verifiable-strategy/">
          Read the verification method and limitations
        </Link>
      </p>
    </div>
  );
}
