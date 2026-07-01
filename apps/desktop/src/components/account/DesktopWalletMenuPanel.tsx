import { Check, Copy, LogOut, Settings, Wallet } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { truncateAddress } from '@/lib/format';

export interface DesktopWalletMenuPanelProps {
  address: string | null;
  copiedAddress: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onCopyAddress: (address: string) => void;
  onDisconnect: () => void;
  onOpenBundles: () => void;
  onOpenSettings: () => void;
}

export function DesktopWalletMenuPanel({
  address,
  copiedAddress,
  isConnected,
  isConnecting,
  onConnect,
  onCopyAddress,
  onDisconnect,
  onOpenBundles,
  onOpenSettings,
}: DesktopWalletMenuPanelProps) {
  if (!isConnected) {
    return (
      <Card className="rounded-[18px] p-4">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background: '#18181b',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <Wallet size={18} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">
              No wallet connected
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">
              Connect to load balances and activity.
            </div>
          </div>
        </div>
        <PrimaryButton
          className="mt-4"
          disabled={isConnecting}
          onClick={onConnect}
          aria-label="Create Zap Wallet"
        >
          {isConnecting ? 'Connecting...' : 'Create Zap Wallet'}
        </PrimaryButton>
      </Card>
    );
  }

  return (
    <Card className="rounded-[18px]">
      <div
        className="px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[.12em] text-ink-faint">
            Connected wallet
          </span>
          {address ? (
            <button
              type="button"
              aria-label="Copy wallet address"
              className="zp-tap inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] text-accent"
              style={{
                background: 'rgba(212,197,163,.1)',
                border: '1px solid rgba(212,197,163,.2)',
              }}
              onClick={() => onCopyAddress(address)}
            >
              {copiedAddress === address ? (
                <Check size={12} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
              )}
              {copiedAddress === address ? 'Copied' : 'Copy'}
            </button>
          ) : null}
        </div>
        <div className="font-mono text-[13px] text-ink">
          {address ? truncateAddress(address) : '-'}
        </div>
      </div>
      <button
        type="button"
        aria-label="View bundled wallets"
        className="zp-tap flex w-full items-center gap-3 px-4 py-[12px] text-left text-[13px] text-ink"
        onClick={onOpenBundles}
      >
        <Wallet size={17} className="text-accent" aria-hidden="true" />
        <span className="flex-1">View Bundles</span>
      </button>
      <button
        type="button"
        aria-label="Open wallet settings"
        className="zp-tap flex w-full items-center gap-3 px-4 py-[12px] text-left text-[13px] text-ink"
        onClick={onOpenSettings}
      >
        <Settings size={17} className="text-accent" aria-hidden="true" />
        Settings
      </button>
      <button
        type="button"
        aria-label="Disconnect wallet"
        className="zp-tap flex w-full items-center gap-3 px-4 py-[12px] text-left text-[13px] text-error"
        style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}
        onClick={onDisconnect}
      >
        <LogOut size={17} aria-hidden="true" />
        Disconnect
      </button>
    </Card>
  );
}
