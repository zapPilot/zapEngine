import { CheckCircle2, ChevronDown, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';
import {
  chainDisplay,
  formatPlanDuration,
  formatPlanGas,
  planLegsToRouteRows,
  routeStepsLabel,
} from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

const plainCardStyle = {
  background: 'rgba(255,255,255,.025)',
  border: '1px solid rgba(255,255,255,.08)',
} as const;

const iconBadgeStyle = {
  background: '#18181b',
  border: '1px solid rgba(255,255,255,.1)',
} as const;

const dashedConnectorStyle = {
  width: 2,
  borderLeft: '2px dashed rgba(212,197,163,.5)',
} as const;

interface SourceChipProps {
  dotColor: string;
  label: string;
}

function SourceChip({ dotColor, label }: SourceChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] text-ink-dim"
      style={{
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <span
        style={{
          width: 11,
          height: 11,
          borderRadius: 999,
          background: dotColor,
        }}
      />
      {label}
    </span>
  );
}

/** Invest step 2/3 — route flow diagram, fees/time, simulation, steps. */
export function InvestRouteScreen() {
  const navigate = useNavigate();
  const { amountUsd, selectedToken, fromToken, fromAmount, sourceChainId } =
    useInvest();
  const { address } = useAccount();
  const { plan, isLoading, isError } = useDepositPlanPreview({
    address,
    fromToken,
    fromAmount,
    sourceChainId,
    amountUsd,
  });

  // Drive what the plan can supply; keep calm placeholders while it loads and
  // never crash on an error (the design's static copy stays).
  const fromAmountLabel = isLoading ? '—' : formatUsd(amountUsd);
  const stepsLabel = routeStepsLabel(plan?.legs);
  const sourceChain = chainDisplay(sourceChainId);
  const routeRows = planLegsToRouteRows(plan?.legs);
  const planStatus = isLoading
    ? 'Generating plan'
    : isError
      ? 'Plan unavailable'
      : plan
        ? 'Plan generated'
        : 'Awaiting plan';

  return (
    <div className="font-sans text-ink">
      <StepHeader title="Review route" step="STEP 2 OF 3 · ROUTE" />
      <StepProgress current={2} />

      <div className="mx-5 mt-5">
        {/* From your portfolio */}
        <div className="rounded-2xl px-[15px] py-[14px]" style={plainCardStyle}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[11px]">
              <span
                className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
                style={iconBadgeStyle}
              >
                <CreditCard
                  size={17}
                  strokeWidth={1.7}
                  className="text-ink-dim"
                />
              </span>
              <div>
                <div className="text-[14px] font-semibold">
                  From your portfolio
                </div>
                <div className="mt-0.5 text-[11px] text-ink-faint">
                  {sourceChain.label} source · {selectedToken.symbol}
                </div>
              </div>
            </div>
            <span
              className="text-[14px] font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {fromAmountLabel}
            </span>
          </div>
          <div className="mt-[11px] flex gap-1.5">
            <SourceChip
              dotColor={sourceChain.color}
              label={`${selectedToken.symbol} · ${sourceChain.label}`}
            />
          </div>
        </div>

        {/* connector with bridge chip */}
        <div className="flex flex-col items-center py-[3px]">
          <div style={{ ...dashedConnectorStyle, height: 13 }} />
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[8.5px] tracking-[.1em]"
            style={{
              color: '#9a8f78',
              background: 'rgba(212,197,163,.1)',
              border: '1px solid rgba(212,197,163,.22)',
            }}
          >
            {stepsLabel}
          </span>
          <div style={{ ...dashedConnectorStyle, height: 13 }} />
        </div>

        {/* Zap routing */}
        <div
          className="flex items-center gap-[11px] rounded-2xl px-[15px] py-[14px]"
          style={{
            background:
              'linear-gradient(150deg,rgba(212,197,163,.11),rgba(20,20,22,.5))',
            border: '1px solid rgba(212,197,163,.28)',
          }}
        >
          <span
            className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
            style={{
              background: '#0e0e10',
              border: '1px solid rgba(212,197,163,.35)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1.5"
                y="7.5"
                width="3"
                height="7"
                rx="1.2"
                fill="#d4c5a3"
              />
              <rect
                x="6.5"
                y="3.5"
                width="3"
                height="11"
                rx="1.2"
                fill="#d4c5a3"
              />
              <rect
                x="11.5"
                y="9.5"
                width="3"
                height="5"
                rx="1.2"
                fill="#9a8f78"
              />
            </svg>
          </span>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">Zap routing</div>
            <div className="mt-0.5 text-[11px]" style={{ color: '#9a8f78' }}>
              {plan ? 'Route ready from DepositPlan' : planStatus}
            </div>
          </div>
          <CheckCircle2 size={20} strokeWidth={2} className="text-accent" />
        </div>

        {/* connector */}
        <div className="flex flex-col items-center py-[3px]">
          <div style={{ ...dashedConnectorStyle, height: 22 }} />
        </div>

        {/* Zap Strategy */}
        <div
          className="flex items-center justify-between rounded-2xl px-[15px] py-[14px]"
          style={plainCardStyle}
        >
          <div className="flex items-center gap-[11px]">
            <span
              className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
              style={{
                background: 'linear-gradient(140deg,#2b2820,#141416)',
                border: '1px solid rgba(212,197,163,.4)',
              }}
            >
              <ZapLogo size={16} />
            </span>
            <div>
              <div className="text-[14px] font-semibold">Zap Strategy</div>
              <div className="mt-0.5 text-[11px] text-ink-faint">
                Strategy position
              </div>
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[15px] font-semibold text-accent"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {plan ? 'Route prepared' : '—'}
            </div>
            <div className="mt-0.5 text-[10.5px] text-ink-faint">
              fees estimated below
            </div>
          </div>
        </div>
      </div>

      {/* summary rows */}
      <div className="mx-[22px] mt-[18px]">
        <InfoRow
          divider={true}
          label="Estimated network fee"
          value={formatPlanGas(plan?.totalGasUsd)}
        />
        <InfoRow
          divider={true}
          label="Estimated time"
          value={formatPlanDuration(plan?.legs)}
        />
        <InfoRow
          label="Plan status"
          value={<span className="text-ink-dim">{planStatus}</span>}
        />
      </div>

      <div
        className="mx-5 mt-1.5 flex items-center gap-[11px] rounded-[14px] px-[14px] py-3"
        style={{
          background: 'rgba(212,197,163,.07)',
          border: '1px solid rgba(212,197,163,.2)',
        }}
      >
        <CheckCircle2 size={22} strokeWidth={2} className="text-accent" />
        <div>
          <div className="text-[13px] font-semibold text-accent">
            {planStatus}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: '#8a8a82' }}>
            {plan
              ? 'Review the generated plan before signing.'
              : 'No simulation result is available in route preview.'}
          </div>
        </div>
      </div>

      <div
        className="mx-5 mt-[11px] rounded-[14px] px-[15px] py-[13px]"
        style={plainCardStyle}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-ink-dim">
            Routing steps &amp; networks
          </span>
          <ChevronDown size={16} strokeWidth={2} className="text-ink-faint" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {routeRows.length > 0 ? (
            routeRows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: row.dotColor }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-[12px] text-ink-dim">
                  {row.label}
                </span>
                <span className="font-mono text-[9.5px] text-ink-faint">
                  {row.meta}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[12px] text-ink-faint">—</div>
          )}
        </div>
      </div>

      <div className="px-5 pt-4">
        <PrimaryButton
          onClick={() => navigate('/invest/confirm')}
          disabled={!plan || isLoading || isError}
        >
          Continue
          <ArrowGlyph />
        </PrimaryButton>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
