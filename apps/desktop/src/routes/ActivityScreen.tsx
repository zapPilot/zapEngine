/** Activity — filtered, time-grouped events with collapsed multi-step txns. */
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Pill } from '@/components/ui/Pill';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ZapLogo } from '@/components/ui/ZapLogo';
import {
  ACTIVITY_FILTERS,
  type ActivityEvent,
  type ActivityFilter,
  type ActivityGroup,
  type ActivityKind,
  type ActivityStatus,
  type MetricTone,
} from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { useActivityData } from '@/integration/useActivityData';
import { cn } from '@/lib/cn';

/** Maps a filter selection to the activity kinds it admits ('All' → null). */
const FILTER_KINDS: Record<ActivityFilter, ActivityKind | null> = {
  All: null,
  Deposits: 'deposit',
  Withdrawals: 'withdraw',
  Rebalances: 'rebalance',
  Yield: 'yield',
};

/** Amount-label color per tone (accent/positive use the design's hues). */
const TONE_COLOR: Record<MetricTone, string> = {
  neutral: 'var(--ink)',
  positive: '#7ad88f',
  negative: '#ef6f6f',
  accent: '#d4c5a3',
};

function matchesFilter(event: ActivityEvent, filter: ActivityFilter): boolean {
  const kind = FILTER_KINDS[filter];
  return kind === null || event.kind === kind;
}

function EventBadge({ kind }: { kind: ActivityKind }) {
  if (kind === 'invest') {
    return (
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{
          background: 'linear-gradient(140deg,#2b2820,#141416)',
          border: '1px solid rgba(212,197,163,.3)',
        }}
      >
        <ZapLogo size={18} />
      </span>
    );
  }

  const iconByKind: Record<Exclude<ActivityKind, 'invest'>, ReactElement> = {
    rebalance: <RefreshCw size={18} strokeWidth={1.8} color="#a1a1aa" />,
    yield: <TrendingUp size={18} strokeWidth={1.9} color="#7ad88f" />,
    deposit: <ArrowDown size={18} strokeWidth={1.9} color="#cfcabb" />,
    withdraw: <ArrowUp size={18} strokeWidth={1.9} color="#cfcabb" />,
    'strategy-update': (
      <BarChart3 size={18} strokeWidth={1.8} color="#a1a1aa" />
    ),
  };

  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
      style={{
        background: '#18181b',
        border: '1px solid rgba(255,255,255,.08)',
      }}
      aria-hidden="true"
    >
      {iconByKind[kind]}
    </span>
  );
}

function StatusPill({ status }: { status: ActivityStatus }) {
  const isSuccess = status === 'Completed' || status === 'Settled';
  const isFailed = status === 'Failed';
  return (
    <Pill
      className="gap-0 px-[7px] py-[2px] font-mono text-[9px]"
      style={
        isSuccess
          ? { color: '#7ad88f', background: 'rgba(122,216,143,.12)' }
          : isFailed
            ? { color: '#ef6f6f', background: 'rgba(239,111,111,.12)' }
            : { color: '#a1a1aa', background: 'rgba(255,255,255,.06)' }
      }
    >
      {status}
    </Pill>
  );
}

function EventRow({ event, first }: { event: ActivityEvent; first: boolean }) {
  const showChevron =
    event.kind === 'rebalance' || event.kind === 'strategy-update';

  return (
    <>
      <div
        className={cn('flex gap-3 py-[13px]', !first && 'border-t border-line')}
      >
        <EventBadge kind={event.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-semibold text-ink">
              {event.title}
            </span>
            {showChevron ? (
              <ChevronRight
                size={16}
                strokeWidth={2}
                color="#52525b"
                className="shrink-0"
                aria-hidden="true"
              />
            ) : event.amountLabel ? (
              <span
                className="text-[14px] font-semibold tabular-nums"
                style={{ color: TONE_COLOR[event.amountTone ?? 'neutral'] }}
              >
                {event.amountLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-[5px] flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <StatusPill status={event.status} />
              <span className="text-[11px]" style={{ color: '#6f6a5f' }}>
                {event.meta}
              </span>
            </span>
            <span
              className="font-mono text-[10px]"
              style={{ color: '#52525b' }}
            >
              {event.time}
            </span>
          </div>
        </div>
      </div>

      {event.steps && event.steps.length > 0 ? (
        <div
          className="mb-[10px] ml-[52px] mt-[2px] rounded-[13px] px-[14px] py-3"
          style={{
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <div
            className="font-mono text-[8.5px] tracking-[.1em]"
            style={{ color: '#6f6a5f' }}
          >
            GROUPED INTO ONE EVENT · {event.steps.length} STEPS
          </div>
          <div className="mt-[10px] flex flex-col gap-[9px]">
            {event.steps.map((step) => (
              <div key={step.label} className="flex items-center gap-[9px]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7ad88f"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span
                  className="flex-1 text-[11.5px]"
                  style={{ color: '#cfcabb' }}
                >
                  {step.label}
                </span>
                <ExternalLink
                  size={13}
                  strokeWidth={2}
                  color="#6f6a5f"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ActivityScreen() {
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const { address, walletAddresses } = useAccount();
  const activityAddressInput =
    walletAddresses.length > 0 ? walletAddresses : address;
  const { data, isLoading, isError } = useActivityData(activityAddressInput);

  const pending =
    (Array.isArray(activityAddressInput)
      ? activityAddressInput.length === 0
      : activityAddressInput === null) || isLoading;
  const source: ActivityGroup[] = data?.groups ?? [];
  const groups = source
    .map((group) => ({
      ...group,
      events: group.events.filter((event) => matchesFilter(event, filter)),
    }))
    .filter((group) => group.events.length > 0);

  return (
    <div data-screen="activity">
      <ScreenHeader title="Activity" />

      <div className="flex gap-1.5 px-5 pt-4">
        {ACTIVITY_FILTERS.map((option) => {
          const active = option === filter;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className="zp-tap rounded-full px-[13px] py-1.5 text-[11.5px]"
              style={
                active
                  ? {
                      background: 'rgba(212,197,163,.16)',
                      color: '#d4c5a3',
                      fontWeight: 600,
                    }
                  : {
                      background: 'rgba(255,255,255,.04)',
                      color: '#a1a1aa',
                      border: '1px solid rgba(255,255,255,.07)',
                    }
              }
            >
              {option}
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <section key={group.label}>
          <div
            className="px-5 pt-[18px] font-mono text-[9.5px] tracking-[.12em]"
            style={{ color: '#6f6a5f' }}
          >
            {group.label.toUpperCase()}
          </div>
          <div className="px-5">
            {group.events.map((event, index) => (
              <EventRow key={event.id} event={event} first={index === 0} />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <div
          className="px-5 pt-[18px] text-[12px]"
          style={{ color: '#6f6a5f' }}
        >
          {pending
            ? 'Connect a wallet to load activity history.'
            : isError
              ? 'Activity is unavailable right now.'
              : 'No supported token activity yet.'}
        </div>
      ) : null}
    </div>
  );
}
