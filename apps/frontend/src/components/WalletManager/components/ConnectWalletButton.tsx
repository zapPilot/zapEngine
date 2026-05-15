import { useState } from 'react';
import { useConnection } from 'wagmi';

import { WALLET_LABELS } from '@/constants/wallet';

import { WalletPickerModal } from './WalletPickerModal';

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleConnect = () => {
    setIsPickerOpen(true);
  };

  return (
    <div className={className}>
      {isConnected && address ? (
        <button
          className="w-full px-4 py-3 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 font-semibold text-sm"
          disabled
        >
          {shortenAddress(address)}
        </button>
      ) : (
        <button
          onClick={handleConnect}
          className="w-full px-4 py-3 rounded-xl font-semibold text-sm text-white cursor-pointer transition-all duration-200 hover:opacity-90"
          style={{
            background:
              'linear-gradient(135deg, rgb(168 85 247) 0%, rgb(124 58 237) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
          }}
        >
          {WALLET_LABELS.CONNECT}
        </button>
      )}
      <WalletPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
      />
    </div>
  );
}
