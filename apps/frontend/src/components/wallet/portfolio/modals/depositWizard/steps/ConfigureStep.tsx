import { parseUsdcInput } from '@zapengine/app-core/lib/wallet/usd6';
import { type ReactElement, useState } from 'react';

export function ConfigureStep({
  onSubmit,
  pending,
}: {
  onSubmit: (fromAmount: string) => void;
  pending: boolean;
}): ReactElement {
  const [amount, setAmount] = useState('');

  let parsedAmount: string | null = null;
  try {
    parsedAmount = amount ? parseUsdcInput(amount) : null;
  } catch {
    parsedAmount = null;
  }

  const canSubmit = Boolean(parsedAmount) && !pending;

  return (
    <div className="space-y-4" data-testid="wizard-configure-step">
      <div>
        <label
          className="mb-1 block text-sm text-gray-300"
          htmlFor="wizard-amount"
        >
          Amount (USDC on Base)
        </label>
        <input
          id="wizard-amount"
          data-testid="wizard-amount-input"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          inputMode="decimal"
          placeholder="100"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {amount && !parsedAmount && (
          <p className="mt-1 text-xs text-red-400">
            Enter a valid USDC amount (up to 6 decimals).
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3 text-sm text-gray-300">
        One click on Base executes everything: the Base vault deposit and the
        bridge into your Hyperliquid account. The final HLP deposit is a gasless
        signature once funds arrive.
      </div>

      <button
        type="button"
        data-testid="wizard-start-button"
        disabled={!canSubmit}
        onClick={() => parsedAmount && onSubmit(parsedAmount)}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? 'Working…' : 'Deposit (one click on Base)'}
      </button>
    </div>
  );
}
