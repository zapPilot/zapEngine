import { Wallet } from 'lucide-react';
import type { ReactElement } from 'react';
import type { Connector } from 'wagmi';

interface WalletConnectorPickerProps {
  connectors: readonly Connector[];
  isConnecting: boolean;
  selectedConnectorId: string | null;
  onSelectConnector: (connector: Connector) => void;
  className?: string;
}

interface WalletConnectorIconProps {
  connector: Connector;
}

export function getWalletConnectorKey(connector: Connector): string {
  return connector.uid ?? `${connector.id}:${connector.name}`;
}

function WalletConnectorIcon({
  connector,
}: WalletConnectorIconProps): ReactElement {
  if (connector.icon) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-950/60 ring-1 ring-white/10">
        <img
          data-testid="wallet-connector-icon"
          src={connector.icon}
          alt=""
          aria-hidden="true"
          className="h-7 w-7 rounded-full object-contain"
        />
      </span>
    );
  }

  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/15 ring-1 ring-purple-400/20">
      <Wallet
        data-testid="wallet-connector-fallback-icon"
        className="h-5 w-5 text-purple-300"
        aria-hidden="true"
      />
    </span>
  );
}

export function WalletConnectorPicker({
  connectors,
  isConnecting,
  selectedConnectorId,
  onSelectConnector,
  className = '',
}: WalletConnectorPickerProps): ReactElement {
  if (connectors.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2.5 text-sm text-gray-400">
        No wallets detected
      </div>
    );
  }

  const gridClassName =
    connectors.length === 1
      ? 'grid grid-cols-1 gap-2'
      : 'grid grid-cols-2 gap-2';

  return (
    <div className={`${gridClassName} ${className}`.trim()}>
      {connectors.map((connector) => {
        const connectorKey = getWalletConnectorKey(connector);
        const isSelected = selectedConnectorId === connectorKey;

        return (
          <button
            key={connectorKey}
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectConnector(connector);
            }}
            disabled={isConnecting}
            aria-busy={isSelected && isConnecting}
            className="min-w-0 rounded-xl border border-gray-700/50 bg-gray-800/40 px-2 py-3 text-center text-xs font-semibold text-gray-100 transition-colors hover:border-purple-500/40 hover:bg-purple-500/10 disabled:cursor-wait disabled:opacity-60 flex flex-col items-center justify-center gap-2"
          >
            <WalletConnectorIcon connector={connector} />
            <span className="max-w-full truncate">{connector.name}</span>
          </button>
        );
      })}
    </div>
  );
}
