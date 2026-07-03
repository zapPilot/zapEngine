import type {
  WizardHlpState,
  WizardLegProgress,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { formatUsd6 } from '@zapengine/app-core/lib/wallet/usd6';
import type { ReactElement } from 'react';

import { LegProgressList } from './LegProgressList';

export function DoneStep({
  legs,
  hlp,
  sourceChainId,
  onClose,
}: {
  legs: WizardLegProgress[];
  hlp: WizardHlpState;
  sourceChainId: number;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="space-y-4" data-testid="wizard-done-step">
      <p className="text-sm text-emerald-400">
        All set — your allocation is configured.
      </p>
      <LegProgressList legs={legs} sourceChainId={sourceChainId} />
      {hlp.status === 'deposited' && hlp.vaultEquityUsd6 !== null && (
        <p className="text-sm text-gray-300">
          HLP equity: {formatUsd6(hlp.vaultEquityUsd6)} USDC
        </p>
      )}
      <button
        type="button"
        data-testid="wizard-close-button"
        onClick={onClose}
        className="w-full rounded-lg bg-gray-700 px-4 py-2 font-medium text-white"
      >
        Close
      </button>
    </div>
  );
}
