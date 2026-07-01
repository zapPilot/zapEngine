import {
  Bell,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Globe,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { DesktopWalletManagerModal } from '@/components/account/DesktopWalletManagerModal';
import { DesktopWalletMenuPanel } from '@/components/account/DesktopWalletMenuPanel';
import { Card } from '@/components/ui/Card';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
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

/** Account — wallet, non-custodial reassurance, settings, disconnect. */
export function AccountScreen() {
  const {
    address,
    email,
    isConnected,
    isConnecting,
    userId,
    connect,
    disconnect,
  } = useAccount();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isWalletManagerOpen, setIsWalletManagerOpen] = useState(false);

  const label = email ?? 'Main Wallet';
  const avatarLetter = (email?.[0] ?? 'Z').toUpperCase();
  const showAccountSkeleton = isConnecting && !isConnected;

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
            {showAccountSkeleton ? (
              <SkeletonBlock className="h-12 w-12 rounded-full" />
            ) : (
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
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-ink">
                {showAccountSkeleton ? (
                  <SkeletonBlock className="h-5 w-28" />
                ) : (
                  label
                )}
              </div>
              <div className="mt-1 flex items-center gap-[7px]">
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: '#a1a1aa' }}
                >
                  {showAccountSkeleton ? (
                    <SkeletonBlock className="h-4 w-24" />
                  ) : address ? (
                    truncateAddress(address)
                  ) : (
                    'Not connected'
                  )}
                </span>
                {address && !showAccountSkeleton ? (
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
        <DesktopWalletMenuPanel
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
          onOpenBundles={() => setIsWalletManagerOpen(true)}
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
      <DesktopWalletManagerModal
        isOpen={isWalletManagerOpen}
        onClose={() => setIsWalletManagerOpen(false)}
        {...(userId ? { urlUserId: userId } : {})}
      />
    </div>
  );
}
