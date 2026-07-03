import { getExplorerAddressUrl } from '@zapengine/app-core/config/chains/display';
import type { WizardHlpState } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { formatUsd6 } from '@zapengine/app-core/lib/wallet/usd6';
import { type ReactElement, useState } from 'react';

const STATUS_COPY: Record<WizardHlpState['status'], string> = {
  idle: 'Waiting for the bridge…',
  awaitingArrival: 'Waiting for USDC to arrive on Hyperliquid…',
  arrived: 'Funds arrived — ready to deposit into HLP.',
  confirming: 'Confirming your HLP deposit…',
  deposited: 'Deposited into HLP.',
};

export function HyperliquidStep({
  hlp,
  userAddress,
  onDeposit,
}: {
  hlp: WizardHlpState;
  userAddress?: string | undefined;
  onDeposit: () => void;
}): ReactElement {
  const step = hlp.step;
  const [lockAccepted, setLockAccepted] = useState(false);
  const accountUrl =
    userAddress && step
      ? getExplorerAddressUrl(step.chainId, userAddress)
      : null;

  return (
    <div className="space-y-4" data-testid="wizard-hlp-step">
      <p className="text-sm text-gray-300" data-testid="wizard-hlp-status">
        {STATUS_COPY[hlp.status]}
      </p>

      {step && (
        <div className="rounded-lg border border-gray-800 bg-gray-800/40 p-3 text-sm text-gray-300">
          <div className="flex justify-between">
            <span>Expected</span>
            <span>{formatUsd6(BigInt(step.expectedUsd))} USDC</span>
          </div>
          {hlp.arrivedUsd6 !== null && (
            <div className="flex justify-between">
              <span>Arrived</span>
              <span data-testid="wizard-hlp-arrived">
                {formatUsd6(hlp.arrivedUsd6)} USDC
              </span>
            </div>
          )}
          {hlp.vaultEquityUsd6 !== null && (
            <div className="flex justify-between">
              <span>HLP equity</span>
              <span data-testid="wizard-hlp-equity">
                {formatUsd6(hlp.vaultEquityUsd6)} USDC
              </span>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Gasless signature — no chain switch. Withdrawals unlock{' '}
            {step.lockupDays} days after each deposit.
          </p>
        </div>
      )}

      {hlp.status !== 'deposited' && (
        <div className="space-y-3">
          {step && (
            <label className="flex items-start gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                data-testid="wizard-hlp-lock-checkbox"
                checked={lockAccepted}
                onChange={(event) => setLockAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>
                I understand this HLP deposit locks withdrawals for{' '}
                {step.lockupDays} days, and the lock resets with every new
                deposit.
              </span>
            </label>
          )}
          <button
            type="button"
            data-testid="wizard-hlp-button"
            disabled={hlp.status !== 'arrived' || !lockAccepted}
            onClick={onDeposit}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hlp.status === 'confirming' ? 'Confirming…' : 'Deposit to HLP'}
          </button>
        </div>
      )}

      {accountUrl && (
        <a
          href={accountUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-purple-400 hover:underline"
        >
          View your Hyperliquid account
        </a>
      )}
    </div>
  );
}
