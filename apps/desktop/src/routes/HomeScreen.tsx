import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Sparkline } from '@/components/charts/Sparkline';
import { ZapStrategyCard } from '@/components/strategy/ZapStrategyCard';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { AppHeader } from '@/components/ui/AppHeader';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { CHAINS, DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import {
  DEFAULT_HOME_RANGE,
  type HomeRange,
  useHomeData,
} from '@/integration/useHomeData';
import {
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
  splitUsd,
} from '@/lib/format';

const RANGE_OPTIONS = ['1D', '1W', '1M', '1Y', 'ALL'] as const;

function AssetRowSkeleton({ divider }: { divider: boolean }) {
  return (
    <div
      className="flex items-center gap-[13px] px-1 py-[11px]"
      style={
        divider
          ? { borderBottom: '1px solid rgba(255,255,255,.05)' }
          : undefined
      }
    >
      <SkeletonBlock className="h-9 w-9 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[7px]">
          <SkeletonBlock className="h-4 w-12" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
        <div className="mt-[7px] flex items-center gap-1.5">
          <SkeletonBlock className="h-4 w-14 rounded-full" />
          <SkeletonBlock className="h-3 w-28" />
        </div>
      </div>
      <div className="flex flex-col items-end">
        <SkeletonBlock className="h-4 w-16" />
        <SkeletonBlock className="mt-[7px] h-3 w-12" />
      </div>
    </div>
  );
}

function AssetListSkeleton() {
  return (
    <div aria-label="Loading wallet tokens" role="status">
      {[0, 1, 2].map((item) => (
        <AssetRowSkeleton key={item} divider={item < 2} />
      ))}
      <span className="sr-only">Loading wallet tokens…</span>
    </div>
  );
}

type HomeSlice = (typeof DEMO)['home'];
type HomeWalletAssets = ReturnType<typeof useHomeData>['walletAssets'];

function HomeBalanceCard({
  home,
  isLoading,
  isPending,
  range,
  onRangeChange,
}: {
  home: HomeSlice;
  isLoading: boolean;
  isPending: boolean;
  range: HomeRange;
  onRangeChange: (range: HomeRange) => void;
}) {
  const hasTotalBalance = typeof home.totalBalance === 'number';
  const showBalanceSkeleton = isLoading && !hasTotalBalance;
  const { whole, fraction } = splitUsd(home.totalBalance ?? 0);

  return (
    <div className="mt-4 px-5">
      <Card
        className="px-[22px] pb-[18px] pt-[22px]"
        style={{
          background:
            'linear-gradient(180deg,rgba(212,197,163,.08),rgba(255,255,255,.018))',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            top: -70,
            right: -50,
            width: 210,
            height: 210,
            background:
              'radial-gradient(circle,rgba(212,197,163,.2),transparent 70%)',
          }}
        />
        <div className="relative">
          <SectionLabel className="tracking-[.16em] text-[11px] text-ink-dim">
            Total balance
          </SectionLabel>
          <div
            className="mt-1.5 font-serif leading-[1.02] tracking-[-.01em] text-ink"
            style={{ fontSize: 54 }}
          >
            {showBalanceSkeleton ? (
              <SkeletonBlock className="h-[55px] w-[210px] rounded-xl" />
            ) : hasTotalBalance ? (
              <>
                {whole}
                <span style={{ color: '#6f6a5f', fontSize: 34 }}>
                  {fraction}
                </span>
              </>
            ) : (
              <span style={{ color: '#6f6a5f' }}>—</span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {showBalanceSkeleton ? (
              <>
                <SkeletonBlock className="h-[25px] w-[68px] rounded-full" />
                <SkeletonBlock className="h-4 w-24" />
              </>
            ) : (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[12.5px] font-semibold text-success"
                  style={{ background: 'rgba(122,216,143,.12)' }}
                >
                  ▲{' '}
                  {isPending || typeof home.changePct !== 'number'
                    ? '—'
                    : formatSignedPct(home.changePct)}
                </span>
                <span className="text-[13px] text-ink-dim">
                  {isPending || typeof home.changeUsdToday !== 'number'
                    ? '— today'
                    : `${formatSignedUsd(home.changeUsdToday)} today`}
                </span>
              </>
            )}
          </div>
          <div className="mt-3 grid min-h-[54px] place-items-center">
            {showBalanceSkeleton || (isLoading && home.sparkline.length < 2) ? (
              <SkeletonBlock className="h-[54px] w-full rounded-2xl" />
            ) : home.sparkline.length >= 2 ? (
              <Sparkline data={home.sparkline} gradientId="sparkHome" />
            ) : (
              <span className="font-mono text-[18px] text-ink-faint">—</span>
            )}
          </div>
          <RangeTabs
            className="mt-2"
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => onRangeChange(value as HomeRange)}
          />
        </div>
      </Card>
    </div>
  );
}

function HomeActions({
  onDeposit,
  onSend,
}: {
  onDeposit: () => void;
  onSend: () => void;
}) {
  return (
    <div className="mt-3.5 flex gap-[11px] px-5">
      <PrimaryButton className="flex-1" onClick={onDeposit}>
        <ArrowDown size={17} strokeWidth={2.2} aria-hidden="true" />
        Deposit
      </PrimaryButton>
      <PrimaryButton variant="secondary" className="flex-1" onClick={onSend}>
        <ArrowUp size={17} strokeWidth={2.2} aria-hidden="true" />
        Send
      </PrimaryButton>
      <button
        type="button"
        aria-label="More actions"
        className="zp-tap grid w-[52px] place-items-center rounded-[15px] border border-line text-ink-dim"
        style={{ background: 'rgba(255,255,255,.05)' }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function HomeAssetsSection({
  home,
  onSendAsset,
  walletAssets,
}: {
  home: HomeSlice;
  onSendAsset: (symbol: string) => void;
  walletAssets: HomeWalletAssets;
}) {
  return (
    <div className="mt-6 px-5">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-semibold text-ink">Assets</div>
        <div className="flex items-center gap-1.5">
          <ChainIconStack chains={['ethereum', 'base', 'arbitrum']} size={13} />
          <span className="font-mono text-[10px] tracking-[.02em] text-ink-faint">
            Ethereum · Base · Arbitrum
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex flex-col">
        {walletAssets.isConnected && walletAssets.isLoading ? (
          <AssetListSkeleton />
        ) : walletAssets.isConnected && walletAssets.isError ? (
          <div className="px-1 py-[11px] text-[12px] text-ink-faint">
            Wallet tokens unavailable.
          </div>
        ) : home.assets.length === 0 ? (
          <div className="px-1 py-[11px] text-[12px] text-ink-faint">
            No supported token holdings yet.
          </div>
        ) : (
          home.assets.map((asset, index) => {
            const isLast = index === home.assets.length - 1;
            return (
              <button
                key={asset.symbol}
                type="button"
                aria-label={`Send ${asset.symbol}`}
                data-testid={`home-asset-${asset.symbol}`}
                onClick={() => onSendAsset(asset.symbol)}
                className="zp-tap flex w-full items-center gap-[13px] px-1 py-[11px] text-left"
                style={
                  isLast
                    ? undefined
                    : { borderBottom: '1px solid rgba(255,255,255,.05)' }
                }
              >
                <TokenIcon glyph={asset.glyph} bg={asset.iconBg} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[7px]">
                    <span className="text-[15.5px] font-semibold text-ink">
                      {asset.symbol}
                    </span>
                    <span className="text-[12px]" style={{ color: '#6f6a5f' }}>
                      {asset.name}
                    </span>
                  </div>
                  <div className="mt-[5px] flex items-center gap-1.5">
                    <ChainIconStack chains={asset.chains} size={14} />
                    <span className="font-mono text-[10.5px] text-ink-faint">
                      {asset.chains.map((c) => CHAINS[c].label).join(' · ')}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15.5px] font-semibold tabular-nums text-ink">
                    {typeof asset.usdValue === 'number'
                      ? formatUsd(asset.usdValue)
                      : '—'}
                  </div>
                  <div className="mt-[5px] font-mono text-[10.5px] text-ink-faint">
                    {asset.amountLabel}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Home — total balance, assets (grouped by token), Zap Strategy card. */
export function HomeScreen() {
  const navigate = useNavigate();
  const [range, setRange] = useState<HomeRange>(DEFAULT_HOME_RANGE);

  const { address, userId, walletAddresses } = useAccount();
  const { data, isLoading, isError, walletAssets } = useHomeData(
    userId,
    address,
    range,
    walletAddresses,
  );

  // Disconnected/demo mode may still use DEMO; connected unavailable live fields
  // render as dashes rather than borrowing design numbers.
  const { home, strategy } = data ?? DEMO;
  // Calm states: while identity/data is resolving (or on error) we keep the
  // full layout but hold the volatile today-change line on a neutral dash so we
  // never flash a stale number as if it were live.
  const isPending = isLoading || isError;
  const handleDeposit = () => navigate('/invest/amount');
  const handleSend = () => navigate('/send');
  const handleSendAsset = (symbol: string) =>
    navigate(`/send?token=${encodeURIComponent(symbol)}`);

  return (
    <div className="pb-6" data-screen="home">
      <AppHeader />

      <HomeBalanceCard
        home={home}
        isLoading={isLoading}
        isPending={isPending}
        range={range}
        onRangeChange={setRange}
      />

      <HomeActions onDeposit={handleDeposit} onSend={handleSend} />

      {/* Assets */}
      <HomeAssetsSection
        home={home}
        onSendAsset={handleSendAsset}
        walletAssets={walletAssets}
      />

      {/* Strategy card */}
      <div className="mt-[22px] px-5">
        <ZapStrategyCard strategy={strategy} onStart={handleDeposit} />
      </div>
    </div>
  );
}
