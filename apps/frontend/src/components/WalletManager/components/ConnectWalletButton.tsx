import { useRef, useState } from 'react';
import {
  type Connector,
  useConnect,
  useConnection,
  useConnectors,
} from 'wagmi';

import { WALLET_LABELS } from '@/constants/wallet';
import { useClickOutside } from '@/hooks/ui/useClickOutside';

import {
  getWalletConnectorKey,
  WalletConnectorPicker,
} from './WalletConnectorPicker';

interface ConnectWalletButtonProps {
  className?: string;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWalletButton({
  className = '',
}: ConnectWalletButtonProps) {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending } = useConnect();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(
    null,
  );

  useClickOutside(containerRef, () => setIsPickerOpen(false), isPickerOpen);

  const handleConnectClick = () => {
    setIsPickerOpen((previousIsOpen) => !previousIsOpen);
  };

  const handleConnectorSelect = async (connector: Connector): Promise<void> => {
    setSelectedConnectorId(getWalletConnectorKey(connector));
    try {
      await connect({ connector });
      setIsPickerOpen(false);
    } catch {
      // Wagmi owns connection error state; keep the picker open so the user can retry.
    } finally {
      setSelectedConnectorId(null);
    }
  };

  return (
    <div className={`${className} relative`} ref={containerRef}>
      {isConnected && address ? (
        <button
          className="w-full px-4 py-3 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 font-semibold text-sm"
          disabled
        >
          {shortenAddress(address)}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleConnectClick}
            disabled={isPending}
            aria-expanded={isPickerOpen}
            aria-haspopup="menu"
            className="w-full px-4 py-3 rounded-xl font-semibold text-sm text-white cursor-pointer transition-all duration-200 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            style={{
              background:
                'linear-gradient(135deg, rgb(168 85 247) 0%, rgb(124 58 237) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}
          >
            {isPending ? 'Connecting...' : WALLET_LABELS.CONNECT}
          </button>

          {isPickerOpen && (
            <div
              role="menu"
              aria-label="Wallet options"
              className="absolute top-full left-0 right-0 mt-2 min-w-56 rounded-xl border border-purple-500/30 bg-gray-900 shadow-2xl shadow-purple-500/10 backdrop-blur-xl z-50 p-2"
            >
              <WalletConnectorPicker
                connectors={connectors}
                isConnecting={isPending}
                selectedConnectorId={selectedConnectorId}
                onSelectConnector={(connector) => {
                  void handleConnectorSelect(connector);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
