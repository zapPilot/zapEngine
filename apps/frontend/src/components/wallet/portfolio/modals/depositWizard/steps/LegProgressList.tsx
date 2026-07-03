import { getExplorerTxUrl } from '@zapengine/app-core/config/chains/display';
import { getChainName } from '@zapengine/app-core/constants/chains';
import type { WizardLegProgress } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type { ReactElement } from 'react';

const STATUS_LABELS: Record<WizardLegProgress['status'], string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  sourceConfirmed: 'Confirmed on Base',
  bridgePending: 'Bridging…',
  destinationConfirmed: 'Arrived',
  failed: 'Failed',
};

function statusColor(status: WizardLegProgress['status']): string {
  if (status === 'failed') return 'text-red-400';
  if (status === 'destinationConfirmed' || status === 'sourceConfirmed')
    return 'text-emerald-400';
  return 'text-gray-300';
}

function legTitle(leg: WizardLegProgress): string {
  const chain = getChainName(leg.chainId);
  return leg.kind === 'bridge' ? `Bridge → ${chain}` : `Supply on ${chain}`;
}

export function LegProgressList({
  legs,
  sourceChainId,
}: {
  legs: WizardLegProgress[];
  sourceChainId: number;
}): ReactElement {
  return (
    <ul className="space-y-2" data-testid="wizard-leg-list">
      {legs.map((leg, index) => {
        const destinationUrl = leg.destinationTxHash
          ? getExplorerTxUrl(leg.chainId, leg.destinationTxHash)
          : null;
        const sourceUrl = leg.sourceTxHash
          ? getExplorerTxUrl(sourceChainId, leg.sourceTxHash)
          : null;
        return (
          <li
            key={`${leg.chainId}-${index}`}
            className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2"
            data-testid={`wizard-leg-${index}`}
          >
            <div className="text-sm text-white">
              {legTitle(leg)}
              <div className="flex gap-3 text-xs">
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-400 hover:underline"
                  >
                    source tx
                  </a>
                )}
                {destinationUrl && (
                  <a
                    href={destinationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-400 hover:underline"
                  >
                    destination tx
                  </a>
                )}
              </div>
            </div>
            <span className={`text-xs font-medium ${statusColor(leg.status)}`}>
              {STATUS_LABELS[leg.status]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
