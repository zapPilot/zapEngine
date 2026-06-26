import { usePrivy, useWallets } from '@privy-io/react-auth';
import { WALLET_LABELS } from '@zapengine/app-core/constants/wallet';

interface CreateZapWalletButtonProps {
  className?: string;
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Native Privy "Create Zap Wallet" button.
 *
 * Opens the Privy login modal (email/Google/Apple) which auto-provisions an
 * embedded EOA — the "create your own wallet" entry point for the Privy
 * embedded-wallet flow. Must be rendered inside a `PrivyProvider`.
 */
export function CreateZapWalletButton({
  className = '',
}: CreateZapWalletButtonProps) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === 'privy',
  );

  if (authenticated && embeddedWallet) {
    return (
      <div className={`${className} relative`}>
        <button
          className="w-full px-4 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-semibold text-sm"
          disabled
        >
          {shortenAddress(embeddedWallet.address)}
        </button>
      </div>
    );
  }

  return (
    <div className={`${className} relative`}>
      <button
        type="button"
        onClick={() => login()}
        disabled={!ready}
        aria-haspopup="dialog"
        className="w-full px-4 py-3 rounded-xl font-semibold text-sm text-white cursor-pointer transition-all duration-200 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        style={{
          background:
            'linear-gradient(135deg, rgb(16 185 129) 0%, rgb(5 150 105) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        {WALLET_LABELS.CREATE_ZAP_WALLET}
      </button>
    </div>
  );
}
