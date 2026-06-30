import { ArrowDown, ArrowUp, ChevronDown, MoreHorizontal } from 'lucide-react';
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
import { tokenIconSrcForSymbol } from '@/data/assetIcons';
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
type HomeAsset = HomeSlice['assets'][number];
type HomeWalletAssets = ReturnType<typeof useHomeData>['walletAssets'];

type PortfolioExposureId = 'eth' | 'btc' | 'stables' | 'sp500' | 'other';

interface ExposureIconSeed {
  bg: string;
  glyph: string;
  symbol: string;
}

interface PortfolioExposureMeta {
  label: string;
  iconBg: string;
  barColor: string;
  glyph: string;
  fallbackIcons: readonly ExposureIconSeed[];
}

interface PortfolioExposure extends PortfolioExposureMeta {
  id: PortfolioExposureId;
  usdValue: number | null;
  percentage: number | null;
  assets: HomeAsset[];
}

const PORTFOLIO_EXPOSURE_ORDER: PortfolioExposureId[] = [
  'eth',
  'btc',
  'stables',
  'sp500',
  'other',
];

const PORTFOLIO_EXPOSURE_META: Record<
  PortfolioExposureId,
  PortfolioExposureMeta
> = {
  eth: {
    label: 'ETH Group',
    iconBg: '#2a2a30',
    barColor: '#8b5cf6',
    glyph: 'Ξ',
    fallbackIcons: [
      { bg: '#2a2a30', glyph: 'Ξ', symbol: 'ETH' },
      { bg: '#627eea', glyph: 'Ξ', symbol: 'WETH' },
    ],
  },
  btc: {
    label: 'BTC Group',
    iconBg: '#f7931a',
    barColor: '#f7931a',
    glyph: '₿',
    fallbackIcons: [
      { bg: '#f7931a', glyph: '₿', symbol: 'BTC' },
      { bg: '#0052ff', glyph: '₿', symbol: 'CBBTC' },
    ],
  },
  stables: {
    label: 'Stables Group',
    iconBg: '#2775ca',
    barColor: '#2775ca',
    glyph: '$',
    fallbackIcons: [
      { bg: '#2775ca', glyph: '$', symbol: 'USDC' },
      { bg: '#26a17b', glyph: '$', symbol: 'USDT' },
    ],
  },
  sp500: {
    label: 'S&P 500 Group',
    iconBg: '#4b5563',
    barColor: '#d4c5a3',
    glyph: 'S',
    fallbackIcons: [
      { bg: '#4b5563', glyph: 'S', symbol: 'SPY' },
      { bg: '#d4c5a3', glyph: 'S', symbol: 'SP500_FALLBACK' },
    ],
  },
  other: {
    label: 'Other Group',
    iconBg: '#6f6a5f',
    barColor: '#6f6a5f',
    glyph: '•',
    fallbackIcons: [
      { bg: '#6f6a5f', glyph: '•', symbol: 'OTHER_PRIMARY' },
      { bg: '#343029', glyph: '+', symbol: 'OTHER_PLUS' },
    ],
  },
};

const ETH_EXPOSURE_SYMBOLS = new Set([
  'ETH',
  'WETH',
  'STETH',
  'WSTETH',
  'RETH',
  'CBETH',
  'WEETH',
  'EZETH',
]);
const BTC_EXPOSURE_SYMBOLS = new Set([
  'BTC',
  'WBTC',
  'CBBTC',
  'TBTC',
  'BTCC',
  'BTCB',
]);
const STABLE_EXPOSURE_SYMBOLS = new Set([
  'USDC',
  'USDT',
  'DAI',
  'FRAX',
  'USDE',
  'SUSDE',
  'USDS',
  'PYUSD',
  'GUSD',
  'LUSD',
]);
const SP500_EXPOSURE_SYMBOLS = new Set([
  'SPY',
  'VOO',
  'IVV',
  'SPLG',
  'SPX',
  'SP500',
]);

function normalizeExposureSymbol(symbol: string): string {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function exposureIdForAsset(asset: HomeAsset): PortfolioExposureId {
  const symbol = normalizeExposureSymbol(asset.symbol);
  if (ETH_EXPOSURE_SYMBOLS.has(symbol)) return 'eth';
  if (BTC_EXPOSURE_SYMBOLS.has(symbol)) return 'btc';
  if (STABLE_EXPOSURE_SYMBOLS.has(symbol)) return 'stables';
  if (SP500_EXPOSURE_SYMBOLS.has(symbol)) return 'sp500';
  return 'other';
}

function numericUsdValue(asset: HomeAsset): number | null {
  return typeof asset.usdValue === 'number' && Number.isFinite(asset.usdValue)
    ? asset.usdValue
    : null;
}

function buildPortfolioExposures(
  assets: readonly HomeAsset[],
): PortfolioExposure[] {
  const grouped = new Map<PortfolioExposureId, HomeAsset[]>();
  let totalUsdValue = 0;

  for (const asset of assets) {
    const id = exposureIdForAsset(asset);
    const existing = grouped.get(id) ?? [];
    existing.push(asset);
    grouped.set(id, existing);

    const usdValue = numericUsdValue(asset);
    if (usdValue !== null) {
      totalUsdValue += usdValue;
    }
  }

  return PORTFOLIO_EXPOSURE_ORDER.map((id) => {
    const exposureAssets = grouped.get(id) ?? [];

    const usdValue = exposureAssets.reduce((sum, asset) => {
      const value = numericUsdValue(asset);
      return value === null ? sum : sum + value;
    }, 0);
    const hasKnownUsdValue =
      exposureAssets.length === 0 ||
      exposureAssets.some((asset) => numericUsdValue(asset) !== null);
    const sortedAssets = [...exposureAssets].sort(
      (a, b) => (numericUsdValue(b) ?? 0) - (numericUsdValue(a) ?? 0),
    );
    const percentage =
      totalUsdValue > 0
        ? (usdValue / totalUsdValue) * 100
        : hasKnownUsdValue
          ? 0
          : null;

    return {
      id,
      ...PORTFOLIO_EXPOSURE_META[id],
      usdValue: hasKnownUsdValue ? usdValue : null,
      percentage,
      assets: sortedAssets,
    };
  });
}

function formatAllocationPct(value: number | null): string {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : '—';
}

function formatTokenCount(count: number): string {
  return `${count} token${count === 1 ? '' : 's'}`;
}

interface ExposureIconToken {
  bg: string;
  glyph: string;
  src?: string;
  symbol: string;
}

function exposureIconTokenForSymbol({
  bg,
  glyph,
  symbol,
}: ExposureIconSeed): ExposureIconToken {
  const src = tokenIconSrcForSymbol(symbol);
  return src ? { bg, glyph, src, symbol } : { bg, glyph, symbol };
}

function tokenIconsForExposure(
  exposure: PortfolioExposure,
): ExposureIconToken[] {
  const seen = new Set<string>();
  const fallbackIcons = exposure.fallbackIcons.map(exposureIconTokenForSymbol);
  const assetIcons = exposure.assets
    .flatMap((asset) => {
      const symbol = normalizeExposureSymbol(asset.symbol);
      if (seen.has(symbol)) return [];
      seen.add(symbol);

      return [
        exposureIconTokenForSymbol({
          bg: asset.iconBg,
          glyph: asset.glyph,
          symbol: asset.symbol,
        }),
      ];
    })
    .slice(0, 3);

  if (assetIcons.length >= 2) {
    return assetIcons;
  }

  const onlyAssetIcon = assetIcons[0];
  if (onlyAssetIcon) {
    const assetSymbol = normalizeExposureSymbol(onlyAssetIcon.symbol);
    const fallbackIcon =
      fallbackIcons.find(
        (icon) => normalizeExposureSymbol(icon.symbol) !== assetSymbol,
      ) ?? fallbackIcons[0];

    return fallbackIcon ? [onlyAssetIcon, fallbackIcon] : [onlyAssetIcon];
  }

  return fallbackIcons.slice(0, 2);
}

function PortfolioExposureIconStack({
  exposure,
}: {
  exposure: PortfolioExposure;
}) {
  const icons = tokenIconsForExposure(exposure);
  const iconSize = 30;
  const iconOffset = 10;
  const width = iconSize + iconOffset * (icons.length - 1);

  return (
    <span
      aria-label={`${exposure.label} grouped token icons`}
      className="relative shrink-0"
      style={{ width, height: 38 }}
    >
      {icons.map((icon, index) => (
        <span
          key={icon.symbol}
          className="absolute top-1 rounded-full ring-2 ring-[#050506]"
          style={{
            left: index * iconOffset,
            zIndex: icons.length - index,
          }}
        >
          <TokenIcon
            alt={icon.symbol}
            glyph={icon.glyph}
            bg={icon.bg}
            size={iconSize}
            {...(icon.src ? { src: icon.src } : {})}
          />
        </span>
      ))}
    </span>
  );
}

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
  const [expandedGroups, setExpandedGroups] = useState<
    Set<PortfolioExposureId>
  >(() => new Set());
  const exposures = buildPortfolioExposures(home.assets);

  const toggleGroup = (id: PortfolioExposureId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mt-6 px-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[17px] font-semibold text-ink">
            Portfolio allocation
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-faint">
            Five portfolio buckets, shown even when empty.
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ChainIconStack chains={['ethereum', 'base', 'arbitrum']} size={13} />
          <span className="font-mono text-[10px] tracking-[.02em] text-ink-faint">
            Portfolio account
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
        ) : (
          exposures.map((exposure, index) => {
            const isExpanded = expandedGroups.has(exposure.id);
            const isLast = index === exposures.length - 1;
            const allocationWidth =
              typeof exposure.percentage === 'number'
                ? `${exposure.percentage > 0 ? Math.max(exposure.percentage, 2) : 0}%`
                : '0%';

            return (
              <div
                key={exposure.id}
                style={
                  isLast
                    ? undefined
                    : { borderBottom: '1px solid rgba(255,255,255,.05)' }
                }
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${exposure.label} exposure`}
                  data-testid={`home-exposure-${exposure.id}`}
                  onClick={() => toggleGroup(exposure.id)}
                  className="zp-tap flex w-full items-center gap-[13px] px-1 py-[11px] text-left"
                >
                  <PortfolioExposureIconStack exposure={exposure} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-[7px]">
                      <span className="text-[15.5px] font-semibold text-ink">
                        {exposure.label}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: '#6f6a5f' }}
                      >
                        {formatTokenCount(exposure.assets.length)}
                      </span>
                    </div>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full"
                      style={{ background: 'rgba(255,255,255,.06)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: allocationWidth,
                          background: exposure.barColor,
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex min-w-[82px] flex-col items-end text-right">
                    <div className="text-[15.5px] font-semibold tabular-nums text-ink">
                      {formatAllocationPct(exposure.percentage)}
                    </div>
                    <div className="mt-[5px] font-mono text-[10.5px] text-ink-faint">
                      {typeof exposure.usdValue === 'number'
                        ? formatUsd(exposure.usdValue)
                        : '—'}
                    </div>
                  </div>
                  <ChevronDown
                    size={17}
                    aria-hidden="true"
                    className="shrink-0 text-ink-faint transition-transform"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                    }}
                  />
                </button>

                {isExpanded ? (
                  <div
                    className="mb-1 ml-[51px] rounded-[16px] border border-line"
                    style={{ background: 'rgba(255,255,255,.025)' }}
                  >
                    {exposure.assets.length === 0 ? (
                      <div className="px-3 py-2.5 text-[11.5px] text-ink-faint">
                        No tokens in this bucket yet.
                      </div>
                    ) : (
                      exposure.assets.map((asset, assetIndex) => {
                        const isLastAsset =
                          assetIndex === exposure.assets.length - 1;
                        return (
                          <button
                            key={asset.symbol}
                            type="button"
                            aria-label={`Send ${asset.symbol}`}
                            data-testid={`home-asset-${asset.symbol}`}
                            onClick={() => onSendAsset(asset.symbol)}
                            className="zp-tap flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                            style={
                              isLastAsset
                                ? undefined
                                : {
                                    borderBottom:
                                      '1px solid rgba(255,255,255,.045)',
                                  }
                            }
                          >
                            <TokenIcon
                              glyph={asset.glyph}
                              bg={asset.iconBg}
                              size={30}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-[7px]">
                                <span className="text-[13.5px] font-semibold text-ink">
                                  {asset.symbol}
                                </span>
                                <span
                                  className="truncate text-[11.5px]"
                                  style={{ color: '#6f6a5f' }}
                                >
                                  {asset.name}
                                </span>
                              </div>
                              <div className="mt-[5px] flex items-center gap-1.5">
                                <ChainIconStack
                                  chains={asset.chains}
                                  size={12}
                                />
                                <span className="truncate font-mono text-[10px] text-ink-faint">
                                  {asset.chains
                                    .map((chain) => CHAINS[chain].label)
                                    .join(' · ')}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[13.5px] font-semibold tabular-nums text-ink">
                                {typeof asset.usdValue === 'number'
                                  ? formatUsd(asset.usdValue)
                                  : '—'}
                              </div>
                              <div className="mt-[5px] font-mono text-[10px] text-ink-faint">
                                {asset.amountLabel}
                              </div>
                            </div>
                            <span
                              className="rounded-full px-2 py-1 text-[10px] font-semibold text-ink-dim"
                              style={{ background: 'rgba(255,255,255,.055)' }}
                            >
                              Send
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Home — total balance, portfolio allocation, Zap Strategy card. */
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
