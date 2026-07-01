import { useGmxDeposit } from '@zapengine/app-core/hooks/useGmxDeposit';
import { useInvestStrategy } from '@zapengine/app-core/hooks/useInvestStrategy';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { ArrowGlyph } from '@/components/ui/ArrowGlyph';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ZapLogo } from '@/components/ui/ZapLogo';
import {
  depositPathProtocolLabel,
  isGmxDepositPath,
} from '@/integration/depositPaths';
import {
  formatPlanDuration,
  formatPlanGas,
} from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

const STEPS = [
  'You sign once in your wallet',
  'Zap executes the prepared deposit plan',
  'Track everything in My Portfolio',
] as const;

/** Invest step 3/3 — summary, what-happens-next, non-custodial, confirm. */
export function InvestConfirmScreen() {
  const navigate = useNavigate();
  const {
    amountUsd,
    selectedDepositPath,
    fromToken,
    fromAmount,
    sourceChainId,
  } = useInvest();
  const { address } = useAccount();
  const { plan, isLoading: planLoading } = useDepositPlanPreview({
    address,
    fromToken,
    fromAmount,
    sourceChainId,
    amountUsd,
    depositPath: selectedDepositPath,
  });
  const invest = useInvestStrategy();
  const gmx = useGmxDeposit();
  const isGmxPath = isGmxDepositPath(selectedDepositPath);
  const pending = isGmxPath ? gmx.pending : invest.pending;
  const lastError = isGmxPath ? gmx.lastError : invest.lastError;
  const getErrorMessage = isGmxPath
    ? gmx.getErrorMessage
    : invest.getErrorMessage;

  const handleConfirm = async () => {
    try {
      await (isGmxPath
        ? gmx.run({
            marketKey: selectedDepositPath.marketKey,
            amount: fromAmount,
          })
        : invest.run({ fromToken, fromAmount, sourceChainId }));
      void navigate('/activity');
    } catch {
      // The hook records the failure in `lastError`; surfaced below the CTA.
      // The wallet sign step never moves funds without user approval.
    }
  };

  const errorMessage = lastError ? getErrorMessage(lastError) : null;

  return (
    <div className="font-sans text-ink">
      <StepHeader title="Confirm" step="STEP 3 OF 3 · CONFIRM" />
      <StepProgress current={3} />

      {/* investing summary */}
      <div
        className="relative mx-5 mt-[22px] overflow-hidden rounded-[22px] p-5"
        style={{
          background:
            'linear-gradient(180deg,rgba(212,197,163,.09),rgba(255,255,255,.016))',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            top: -60,
            right: -40,
            width: 180,
            height: 180,
            background:
              'radial-gradient(circle,rgba(212,197,163,.16),transparent 70%)',
          }}
        />
        <div className="relative">
          <div
            className="font-mono text-[10px] uppercase tracking-[.14em]"
            style={{ color: '#9a8f78' }}
          >
            You&apos;re investing
          </div>
          <div
            className="mt-1 font-serif"
            style={{ fontSize: 46, lineHeight: 1.05 }}
          >
            {formatUsd(amountUsd)}
          </div>
          <div className="mt-2.5 flex items-center gap-[9px]">
            <ArrowGlyph />
            <span
              className="grid h-[26px] w-[26px] place-items-center rounded-lg"
              style={{
                background: '#0e0e10',
                border: '1px solid rgba(212,197,163,.35)',
              }}
            >
              <ZapLogo size={13} />
            </span>
            <span className="text-[14px] font-semibold">
              {depositPathProtocolLabel(selectedDepositPath)}
            </span>
          </div>
          <div
            className="mt-4 flex pt-[14px]"
            style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}
          >
            <div className="flex-1">
              <div className="text-[11px] text-ink-faint">Estimated gas</div>
              <div
                className="mt-[3px] text-[15px] font-semibold"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {planLoading ? (
                  <SkeletonBlock className="h-5 w-14" />
                ) : (
                  formatPlanGas(plan?.totalGasUsd)
                )}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[11px] text-ink-faint">Route time</div>
              <div className="mt-[3px] text-[15px] font-semibold text-accent">
                {planLoading ? (
                  <SkeletonBlock className="h-5 w-16" />
                ) : (
                  formatPlanDuration(plan?.legs)
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* what happens next */}
      <div className="mx-[22px] mt-5">
        <SectionLabel>What happens next</SectionLabel>
        <div className="mt-3 flex flex-col gap-[13px]">
          {STEPS.map((label, index) => (
            <div key={label} className="flex items-center gap-3">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold text-accent"
                style={{ background: 'rgba(212,197,163,.14)' }}
              >
                {index + 1}
              </span>
              <span className="text-[13px] text-ink-dim">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* non-custodial reassurance */}
      <div className="mx-5 mt-5">
        <NonCustodialCard
          title="You keep control of your funds"
          body="Non-custodial. Nothing moves until you sign — Zap Pilot can never touch your funds without your wallet's approval."
        />
      </div>

      <div className="px-5 pt-[18px]">
        <PrimaryButton
          className="py-4 text-[16px] font-bold"
          disabled={pending || fromAmount === '0'}
          onClick={() => void handleConfirm()}
          style={pending ? { opacity: 0.7 } : undefined}
        >
          <Lock size={16} strokeWidth={2.2} />
          {pending ? 'Confirming…' : 'Confirm & Start'}
        </PrimaryButton>
        {errorMessage ? (
          <div
            className="mt-[11px] text-center text-[11.5px] text-error"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : (
          <div className="mt-[11px] text-center text-[11.5px] text-ink-faint">
            You&apos;ll approve this in your wallet · nothing is sent before you
            sign
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="zp-tap mt-[14px] w-full text-center text-[13px] font-medium"
          style={{ color: '#8a857a' }}
        >
          Cancel
        </button>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
