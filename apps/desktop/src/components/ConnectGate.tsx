import { useState } from 'react';

import { useAccount } from '@/integration/useAccount';

import { PrimaryButton } from './ui/PrimaryButton';
import { ZapLogo } from './ui/ZapLogo';

/**
 * Shown in place of the tab content until a wallet is connected. Triggers the
 * Privy login/embedded-wallet flow via `useAccount().connect()`.
 */
export function ConnectGate() {
  const { connect, isConnecting, error } = useAccount();
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || isConnecting;

  const handleConnect = async () => {
    setSubmitting(true);
    try {
      await connect();
    } catch {
      // surfaced via `error`
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span
        className="grid h-16 w-16 place-items-center rounded-2xl"
        style={{
          background: '#0e0e10',
          border: '1px solid rgba(212,197,163,.35)',
        }}
      >
        <ZapLogo size={32} />
      </span>

      <div className="mt-6 font-serif text-[26px] leading-tight text-ink">
        Zap Pilot
      </div>
      <p className="mt-2 max-w-[260px] text-[13.5px] text-ink-dim">
        Connect your wallet to manage your portfolio. Non-custodial — your keys
        never leave your control.
      </p>

      <PrimaryButton
        className="mt-7 w-full max-w-[280px]"
        onClick={() => void handleConnect()}
        disabled={busy}
      >
        {busy ? 'Connecting…' : 'Connect wallet'}
      </PrimaryButton>

      {error ? (
        <div className="mt-3 max-w-[280px] text-[12px] text-error">{error}</div>
      ) : null}
    </div>
  );
}
