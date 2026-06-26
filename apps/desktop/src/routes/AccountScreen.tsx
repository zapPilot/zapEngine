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

import { Card } from '@/components/ui/Card';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
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

/** Account — wallet, non-custodial reassurance, settings, disconnect. */
export function AccountScreen() {
  const { address, email, isConnected, disconnect } = useAccount();

  const label = email ?? 'Main Wallet';
  const avatarLetter = (email?.[0] ?? 'Z').toUpperCase();

  const handleCopy = () => {
    if (address) {
      void navigator.clipboard?.writeText(address);
    }
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

      {/* non-custodial reassurance */}
      <div className="mt-[14px] px-5">
        <NonCustodialCard
          title="Non-custodial"
          body="Your keys, your funds. Zap Pilot can never move assets without your signature."
        />
      </div>

      {/* settings */}
      <div className="mt-[18px] px-5">
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

      <button
        type="button"
        className="zp-tap mt-[18px] w-full px-5 text-center text-[13px] font-medium text-error"
        onClick={() => void disconnect()}
      >
        Disconnect wallet
      </button>
      <div
        className="mt-[10px] text-center font-mono text-[9.5px]"
        style={{ color: '#3f3b34', letterSpacing: '.06em' }}
      >
        ZAP PILOT v1.0 · POC
      </div>
    </div>
  );
}
