import { useState } from 'react';
import { reproductionCommands } from '@/lib/verifiable-strategy/cli';
import type {
  CalculatorResult,
  Deployment,
} from '@/lib/verifiable-strategy/types';

export function VerifyYourself({
  result,
  deployment,
}: {
  result: CalculatorResult;
  deployment: Deployment;
}) {
  const [copied, setCopied] = useState('');
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('Copied');
    } catch {
      setCopied('Copy unavailable. Select and copy the command below.');
    }
  }
  return (
    <section className="track-record-calculator-card">
      <h2>Verify it yourself</h2>
      <p>
        Each call includes the exact inputs used above, pinned to the same
        block. No wallet or transaction is needed.
      </p>
      {reproductionCommands(result, deployment).map((command) => (
        <details key={command.name}>
          <summary>{command.name} · cast & JSON-RPC</summary>
          <button type="button" onClick={() => void copy(command.cast)}>
            Copy {command.name} cast command
          </button>
          <pre>
            <code>{command.cast}</code>
          </pre>
          <pre>
            <code>{command.curl}</code>
          </pre>
          <pre>
            <code>{command.payload}</code>
          </pre>
        </details>
      ))}
      <p role="status">{copied}</p>
      <details>
        <summary>All call inputs and outputs</summary>
        <pre>
          {JSON.stringify(
            result.steps,
            (_, value: unknown) =>
              typeof value === 'bigint' ? value.toString() : value,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
