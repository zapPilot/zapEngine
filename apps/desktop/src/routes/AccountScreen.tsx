import {
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Globe,
  Lock,
  LogOut,
  type LucideIcon,
  Settings,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { Card } from '@/components/ui/Card';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useAccount } from '@/integration/useAccount';
import { truncateAddress } from '@/lib/format';

interface SettingRow {
  icon: LucideIcon;
  label: string;
  value?: string;
}

const SETTINGS: SettingRow[] = [
  { icon: CreditCard, label: 'Wallet & networks' },
  { icon: Lock, label: 'Security', value: 'Face ID' },
  { icon: Bell, label: 'Notifications' },
  { icon: Globe, label: 'Display currency', value: 'USD' },
  { icon: CircleHelp, label: 'Help & support' },
];

function SettingsRow({
  icon: Icon,
  label,
  value,
  divider,
}: SettingRow & { divider: boolean }) {
  return (
    <div
      className="zp-tap flex items-center gap-[13px] px-4 py-[14px]"
      style={
        divider
          ? { borderBottom: '1px solid rgba(255,255,255,.05)' }
          : undefined
      }
    >
      <Icon
        size={19}
        strokeWidth={1.7}
        style={{ color: '#cfcabb' }}
        aria-hidden="true"
      />
      <span className="flex-1 text-[14px] text-ink">{label}</span>
      {value ? (
        <span
          className="mr-1.5 font-mono text-[11px]"
          style={{ color: '#6f6a5f' }}
        >
          {value}
        </span>
      ) : null}
      <ChevronRight
        size={16}
        strokeWidth={2}
        className="text-ink-faint"
        aria-hidden="true"
      />
    </div>
  );
}

interface WalletMenuPanelProps {
  address: string | null;
  copiedAddress: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onCopyAddress: (address: string) => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
}

function WalletMenuPanel({
  address,
  copiedAddress,
  isConnected,
  isConnecting,
  onConnect,
  onCopyAddress,
  onDisconnect,
  onOpenSettings,
}: WalletMenuPanelProps) {
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
        >
          {isConnecting ? 'Connecting…' : 'Create Zap Wallet'}
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
          {address ? truncateAddress(address) : '—'}
        </div>
      </div>
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-3 px-4 py-[12px] text-left text-[13px] text-ink-faint"
      >
        <Wallet size={17} className="text-accent" aria-hidden="true" />
        <span className="flex-1">View Bundles</span>
        <span className="font-mono text-[9px] uppercase tracking-[.08em]">
          Soon
        </span>
      </button>
      <button
        type="button"
        className="zp-tap flex w-full items-center gap-3 px-4 py-[12px] text-left text-[13px] text-ink"
        onClick={onOpenSettings}
      >
        <Settings size={17} className="text-accent" aria-hidden="true" />
        Settings
      </button>
      <button
        type="button"
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

/** Account — wallet, non-custodial reassurance, settings, disconnect. */
export function AccountScreen() {
  const { address, email, isConnected, isConnecting, connect, disconnect } =
    useAccount();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const label = email ?? 'Main Wallet';
  const avatarLetter = (email?.[0] ?? 'Z').toUpperCase();

  const handleCopy = () => {
    if (address) {
      void navigator.clipboard?.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 2000);
    }
  };

  const handleOpenSettings = () => {
    document.getElementById('account-settings')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div data-screen="account">
      <ScreenHeader title="Account" />

      {/* profile */}
      <div className="mt-[18px] px-5">
        <Card className="rounded-[20px]">
          <div className="flex items-center gap-[14px] p-4">
            <span
              className="grid place-items-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                background: 'linear-gradient(140deg,#3a3526,#161616)',
                border: '1px solid rgba(212,197,163,.35)',
                fontSize: 18,
                fontWeight: 600,
                color: '#d4c5a3',
              }}
            >
              {avatarLetter}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-ink">{label}</div>
              <div className="mt-1 flex items-center gap-[7px]">
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: '#a1a1aa' }}
                >
                  {address ? truncateAddress(address) : 'Not connected'}
                </span>
                {address ? (
                  <button
                    type="button"
                    aria-label="Copy address"
                    className="zp-tap"
                    onClick={handleCopy}
                  >
                    <Copy
                      size={13}
                      strokeWidth={1.9}
                      style={{ color: '#6f6a5f' }}
                      aria-hidden="true"
                    />
                  </button>
                ) : null}
              </div>
            </div>
            {isConnected ? (
              <span
                className="inline-flex items-center gap-[5px] font-mono text-[10px]"
                style={{ color: '#7ad88f' }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: '#7ad88f',
                  }}
                />
                Connected
              </span>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="mt-[14px] px-5">
        <WalletMenuPanel
          address={address}
          copiedAddress={copiedAddress}
          isConnected={isConnected}
          isConnecting={isConnecting}
          onConnect={() => void connect()}
          onCopyAddress={(value) => {
            void navigator.clipboard?.writeText(value);
            setCopiedAddress(value);
            window.setTimeout(() => setCopiedAddress(null), 2000);
          }}
          onDisconnect={() => void disconnect()}
          onOpenSettings={handleOpenSettings}
        />
      </div>

      {/* non-custodial reassurance */}
      <div className="mt-[14px] px-5">
        <NonCustodialCard
          title="Non-custodial"
          body="Your keys, your funds. Zap Pilot can never move assets without your signature."
        />
      </div>

      {/* settings */}
      <div id="account-settings" className="mt-[18px] px-5">
        <Card className="rounded-[18px]">
          {SETTINGS.map((row, index) => (
            <SettingsRow
              key={row.label}
              {...row}
              divider={index < SETTINGS.length - 1}
            />
          ))}
        </Card>
      </div>
      <div
        className="mt-[10px] text-center font-mono text-[9.5px]"
        style={{ color: '#3f3b34', letterSpacing: '.06em' }}
      >
        ZAP PILOT v1.0 · POC
      </div>
    </div>
  );
}
