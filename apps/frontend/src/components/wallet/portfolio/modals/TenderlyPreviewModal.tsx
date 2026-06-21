import type { PrivyPrepareSendCallsResponse } from '@zapengine/types/api';
import { motion, type Variants } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  Clock,
  CloudOff,
  ExternalLink,
  Loader,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from 'react';

import { Modal, ModalContent } from '@/components/ui/modal';
import { getChainName } from '@/constants/chains';
import type { PrivyBatchExecutionPhase } from '@/hooks/wallet/usePrivyWalletBackend';
import { fadeInUp, SMOOTH_TRANSITION } from '@/lib/ui/animationVariants';
import { cn } from '@/lib/ui/classNames';

interface TenderlyPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: PrivyPrepareSendCallsResponse | null;
  onConfirm: (acknowledgedRiskHash?: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onUpdateApproval: (callIndex: number, amount: string) => Promise<void>;
  isSigningAndSending: boolean;
  batchExecutionPhase?: PrivyBatchExecutionPhase;
  isRetryingSimulation: boolean;
  retryError?: string | null;
}

type PreviewCall = PrivyPrepareSendCallsResponse['calls'][number];
type AssetChange = PrivyPrepareSendCallsResponse['assetChanges'][number];

// Brand staggered reveal — sections cascade in after the modal scales open.
const sectionStagger: Variants = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

function formatAddress(address: string | null): string {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(rawAmount: string, decimals: number): string {
  const negative = rawAmount.startsWith('-');
  const digits = negative ? rawAmount.slice(1) : rawAmount;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fractionRaw = decimals === 0 ? '' : padded.slice(-decimals);
  let fractionEnd = fractionRaw.length;
  while (fractionEnd > 0 && fractionRaw[fractionEnd - 1] === '0') fractionEnd--;
  const fraction = fractionRaw.slice(0, fractionEnd);
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function compactTokenAmount(rawAmount: string, decimals: number): string {
  const exact = formatTokenAmount(rawAmount, decimals);
  const negative = exact.startsWith('-');
  const unsigned = negative ? exact.slice(1) : exact;
  const [integer, fraction] = unsigned.split('.');
  if (!fraction) return exact;

  let firstSignificant = -1;
  for (let index = 0; index < fraction.length; index++) {
    if (fraction[index] !== '0') {
      firstSignificant = index;
      break;
    }
  }
  const visibleFractionLength =
    integer === '0' && firstSignificant >= 0 ? firstSignificant + 6 : 6;
  const fractionSlice = fraction.slice(0, visibleFractionLength);
  let fractionEnd = fractionSlice.length;
  while (fractionEnd > 0 && fractionSlice[fractionEnd - 1] === '0') {
    fractionEnd--;
  }
  const visibleFraction = fractionSlice.slice(0, fractionEnd);
  return `${negative ? '-' : ''}${integer}${visibleFraction ? `.${visibleFraction}` : ''}`;
}

function formatExpiry(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
  if (seconds === 0) return 'Expired';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function titleCase(value: string | null): string {
  if (!value) return 'Contract call';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function callTarget(
  preview: PrivyPrepareSendCallsResponse,
  call: PreviewCall,
): string {
  const contract = preview.contracts.find(
    (candidate) => candidate.address.toLowerCase() === call.to.toLowerCase(),
  );
  return contract?.name ?? formatAddress(call.to);
}

function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint',
        className,
      )}
    >
      {children}
    </span>
  );
}

function TokenMark({ change }: { change: AssetChange }): ReactElement {
  if (change.token.logoUrl) {
    return (
      <img
        src={change.token.logoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full bg-surface-elevated object-cover"
      />
    );
  }
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-elevated text-xs font-semibold text-ink-dim">
      {change.token.symbol.slice(0, 2)}
    </div>
  );
}

function AssetRow({ change }: { change: AssetChange }): ReactElement {
  const outgoing = change.direction === 'out';
  const sign = outgoing ? '-' : '+';
  const exactAmount = formatTokenAmount(
    change.rawAmount,
    change.token.decimals,
  );
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-t border-line px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TokenMark change={change} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">
            {change.token.symbol}
          </div>
          <div className="truncate text-xs text-ink-faint">
            {change.token.name}
          </div>
        </div>
      </div>
      <div
        title={`${sign}${exactAmount} ${change.token.symbol}`}
        className={cn(
          'max-w-[55%] min-w-0 shrink truncate text-right font-serif text-2xl leading-none',
          outgoing ? 'text-ink' : 'text-success',
        )}
      >
        {sign}
        {compactTokenAmount(change.rawAmount, change.token.decimals)}{' '}
        <span className="font-sans text-sm text-ink-dim">
          {change.token.symbol}
        </span>
      </div>
    </div>
  );
}

function FlowSide({
  label,
  direction,
  changes,
}: {
  label: string;
  direction: 'out' | 'in';
  changes: AssetChange[];
}): ReactElement {
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft;
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 sm:px-5">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            direction === 'out' ? 'text-ink-faint' : 'text-success',
          )}
        />
        <Eyebrow>{label}</Eyebrow>
      </div>
      {changes.length > 0 ? (
        changes.map((change, index) => (
          <AssetRow
            key={`${direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
            change={change}
          />
        ))
      ) : (
        <div className="px-4 py-3 text-sm text-ink-faint sm:px-5">
          No assets detected
        </div>
      )}
    </div>
  );
}

function NetFlow({
  outgoing,
  incoming,
}: {
  outgoing: AssetChange[];
  incoming: AssetChange[];
}): ReactElement {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <FlowSide label="You send" direction="out" changes={outgoing} />
      <div className="relative mx-4 h-px bg-line sm:mx-5">
        <div className="absolute top-1/2 left-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line-hi bg-surface-elevated text-ink-dim">
          <ArrowDown className="h-3.5 w-3.5" />
        </div>
      </div>
      <FlowSide label="You receive" direction="in" changes={incoming} />
    </section>
  );
}

function StepNode({ status }: { status: PreviewCall['status'] }): ReactElement {
  const base =
    'relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-bg';
  if (status === 'succeeded') {
    return (
      <div className={cn(base, 'border-success/40 text-success')}>
        <Check className="h-5 w-5" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className={cn(base, 'border-error/40 text-error')}>
        <X className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className={cn(base, 'border-line text-ink-faint')}>
      <CircleDashed className="h-5 w-5" />
    </div>
  );
}

function Evidence({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 truncate font-mono text-xs text-ink-dim">
        {value}
      </div>
    </div>
  );
}

function ExecutionStep({
  preview,
  call,
  isLast,
  onUpdateApproval,
  isUpdating,
}: {
  preview: PrivyPrepareSendCallsResponse;
  call: PreviewCall;
  isLast: boolean;
  onUpdateApproval: (callIndex: number, amount: string) => Promise<void>;
  isUpdating: boolean;
}): ReactElement {
  const approval = preview.approvals.find(
    (candidate) => candidate.callIndex === call.index,
  );
  const [editingApproval, setEditingApproval] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState(approval?.amount ?? '');

  const startEditing = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setApprovalAmount(approval?.amount ?? '');
    setEditingApproval(true);
    const details = event.currentTarget.closest('details');
    if (details) details.open = true;
  };

  const submitApproval = async () => {
    try {
      await onUpdateApproval(call.index, approvalAmount);
      setEditingApproval(false);
    } catch {
      setEditingApproval(true);
    }
  };

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-9 left-[18px] -bottom-2 w-px bg-line"
        />
      )}
      <StepNode status={call.status} />
      <details className="group min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface open:border-line-hi">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-ink">
                {titleCase(call.method)}
              </span>
              <span className="text-sm text-ink-dim">
                to {callTarget(preview, call)}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-ink-faint">
              Step {call.index + 1} of {preview.calls.length}
            </div>
          </div>
          {approval && (
            <span className="max-w-[42%] shrink-0 truncate rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1 font-mono text-xs font-medium text-accent">
              {approval.unlimited
                ? 'Unlimited'
                : compactTokenAmount(
                    approval.rawAmount,
                    approval.token.decimals,
                  )}{' '}
              {approval.token.symbol}
            </span>
          )}
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-faint transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 border-t border-line px-4 py-4 text-xs sm:grid-cols-3 sm:px-5">
          {approval && (
            <div className="space-y-3 rounded-xl border border-accent/20 bg-accent-soft p-3 sm:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-accent">
                  Approve{' '}
                  {approval.unlimited
                    ? 'Unlimited'
                    : compactTokenAmount(
                        approval.rawAmount,
                        approval.token.decimals,
                      )}{' '}
                  {approval.token.symbol}
                </div>
                {!editingApproval && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="rounded-lg px-2 py-1 font-semibold text-accent transition-colors hover:bg-accent/10"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingApproval && (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitApproval();
                  }}
                >
                  <label className="sr-only" htmlFor={`approval-${call.index}`}>
                    Approval amount
                  </label>
                  <input
                    id={`approval-${call.index}`}
                    value={approvalAmount}
                    onChange={(event) => setApprovalAmount(event.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-line-hi bg-bg px-3 font-mono text-sm text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={isUpdating || approvalAmount.trim() === ''}
                    className="min-h-10 rounded-lg bg-accent px-4 font-semibold text-[#221c0f] transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {isUpdating ? 'Simulating...' : 'Apply & simulate'}
                  </button>
                </form>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Evidence
                  label="Spender"
                  value={formatAddress(approval.spender)}
                />
                <Evidence
                  label="Simulated spend"
                  value={`${formatTokenAmount(approval.simulatedSpendRaw, approval.token.decimals)} ${approval.token.symbol}`}
                />
              </div>
              {approval.exceedsSimulatedSpend && (
                <div className="text-accent">
                  Approval exceeds the amount spent in this simulation.
                </div>
              )}
            </div>
          )}
          <Evidence label="Target" value={formatAddress(call.to)} />
          <Evidence label="Status" value={titleCase(call.status)} />
          <Evidence
            label="Gas used"
            value={
              call.gasUsed
                ? Number(call.gasUsed).toLocaleString()
                : 'Not executed'
            }
          />
          {call.error && (
            <div className="rounded-xl border border-error/25 bg-error/[0.08] p-3 text-error sm:col-span-3">
              {call.error}
            </div>
          )}
          <div className="space-y-3 border-t border-line pt-4 sm:col-span-3">
            <Eyebrow>Raw data</Eyebrow>
            <div>
              <Eyebrow>Interacting with (to)</Eyebrow>
              <div className="mt-1 break-all font-mono text-ink-dim">
                {call.to}
              </div>
            </div>
            <Evidence label="Value to be sent" value={call.value} />
            <div>
              <Eyebrow>Data</Eyebrow>
              <div className="mt-1 break-all font-mono text-ink-faint">
                {call.data}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function TenderlyEvidence({
  preview,
  signable,
  expired,
}: {
  preview: PrivyPrepareSendCallsResponse;
  signable: boolean;
  expired: boolean;
}): ReactElement {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">
            Independently simulated by Tenderly
          </div>
          <div className="mt-0.5 text-xs leading-5 text-ink-dim">
            {preview.calls.length}{' '}
            {preview.calls.length === 1 ? 'call' : 'calls'} executed in order as
            one stateful bundle.
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {preview.shareUrls.length > 0 && (
          <div>
            <Eyebrow className="mb-2 block">Public simulation results</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {preview.shareUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View simulation ${index + 1} on Tenderly`}
                  className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-xl border border-line-hi bg-bg px-3 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="truncate">
                    Step {index + 1} ·{' '}
                    {titleCase(preview.calls[index]?.method ?? null)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
        <div
          className={cn(
            'grid gap-4 border-t border-line pt-4',
            signable
              ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3',
          )}
        >
          <Evidence label="Network" value={getChainName(preview.chainId)} />
          <Evidence
            label="Block"
            value={preview.blockNumber?.toLocaleString() ?? 'Unavailable'}
          />
          <Evidence
            label="Call gas"
            value={Number(preview.callGas).toLocaleString()}
          />
          {(preview.status === 'passed' || preview.status === 'warning') && (
            <Evidence
              label="Expires"
              value={expired ? 'Expired' : formatExpiry(preview.expiresAt)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

interface VerdictMeta {
  label: string;
  Icon: typeof ShieldCheck;
  pill: string;
  iconClass: string;
}

function verdictMeta(preview: PrivyPrepareSendCallsResponse): VerdictMeta {
  switch (preview.status) {
    case 'passed':
      return {
        label: 'All checks passed',
        Icon: ShieldCheck,
        pill: 'border-success/30 bg-success/10 text-success',
        iconClass: 'text-success',
      };
    case 'warning':
      return {
        label:
          preview.warnings.length === 1
            ? 'Review 1 warning'
            : `Review ${preview.warnings.length} warnings`,
        Icon: AlertTriangle,
        pill: 'border-accent/30 bg-accent-soft text-accent',
        iconClass: 'text-accent',
      };
    case 'failed':
      return {
        label: 'Simulation failed',
        Icon: XCircle,
        pill: 'border-error/30 bg-error/10 text-error',
        iconClass: 'text-error',
      };
    default:
      return {
        label: 'Simulation unavailable',
        Icon: CloudOff,
        pill: 'border-line-hi bg-surface text-ink-dim',
        iconClass: 'text-ink-dim',
      };
  }
}

const noop = (): void => {
  /* prevent close while a transaction is pending */
};

function getBlockingReason(
  preview: PrivyPrepareSendCallsResponse,
): string | null {
  if (preview.status === 'failed') return preview.failureReason;
  if (preview.status === 'unavailable') return preview.unavailableReason;
  return null;
}

// Owns the expiry countdown for signable previews so the modal body stays lean.
function usePreviewExpiry(
  previewData: PrivyPrepareSendCallsResponse | null,
  isOpen: boolean,
): boolean {
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    setIsExpired(false);
  }, [previewData?.riskHash, previewData?.status]);

  useEffect(() => {
    if (!previewData || !isOpen) return;
    if (previewData.status !== 'passed' && previewData.status !== 'warning')
      return;
    const expiresAt = previewData.expiresAt;
    const checkExpiry = () => setIsExpired(Date.now() > expiresAt);
    checkExpiry();
    const interval = setInterval(checkExpiry, 1000);
    return () => clearInterval(interval);
  }, [previewData, isOpen]);

  return isExpired;
}

function ReviewMetaRow({
  preview,
  expired,
}: {
  preview: PrivyPrepareSendCallsResponse;
  expired: boolean;
}): ReactElement {
  const verdict = verdictMeta(preview);
  const showExpiry =
    preview.status === 'passed' || preview.status === 'warning';
  const showVerdict = preview.status !== 'warning';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {showVerdict && (
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
            verdict.pill,
          )}
        >
          <verdict.Icon className={cn('h-4 w-4', verdict.iconClass)} />
          {verdict.label}
        </span>
      )}
      <div className={cn('flex items-center gap-2', !showVerdict && 'ml-auto')}>
        {showExpiry && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-dim">
            <Clock className="h-3.5 w-3.5" />
            {expired ? 'Expired' : formatExpiry(preview.expiresAt)}
          </span>
        )}
        <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink">
          on {getChainName(preview.chainId)}
          <span className="h-2 w-2 rounded-full bg-usd ring-4 ring-usd/10" />
        </span>
      </div>
    </div>
  );
}

function BlockingBanner({
  failed,
  reason,
}: {
  failed: boolean;
  reason: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 text-sm',
        failed
          ? 'border-error/25 bg-error/[0.06] text-error'
          : 'border-line-hi bg-surface text-ink-dim',
      )}
    >
      {failed ? (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="font-semibold">
          {failed
            ? 'This transaction would revert'
            : 'We could not verify this transaction'}
        </div>
        <div className="mt-0.5 leading-5 break-words">{reason}</div>
      </div>
    </div>
  );
}

function signingActionLabel(
  isSigningAndSending: boolean,
  phase: PrivyBatchExecutionPhase,
): string {
  if (!isSigningAndSending) return 'Sign & Send';

  switch (phase) {
    case 'signingIntent':
      return 'Signing intent…';
    case 'authorizingBatch':
      return 'Authorizing batch…';
    case 'sendingBatch':
      return 'Sending batch…';
    case 'idle':
      return 'Signing…';
  }
}

function ReviewActions({
  preview,
  signable,
  expired,
  busy,
  canSign,
  isSigningAndSending,
  batchExecutionPhase,
  isRetryingSimulation,
  onClose,
  onRetry,
  onConfirm,
}: {
  preview: PrivyPrepareSendCallsResponse;
  signable: boolean;
  expired: boolean;
  busy: boolean;
  canSign: boolean;
  isSigningAndSending: boolean;
  batchExecutionPhase: PrivyBatchExecutionPhase;
  isRetryingSimulation: boolean;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onConfirm: (acknowledgedRiskHash?: string) => Promise<void>;
}): ReactElement {
  const retryLabel = isRetryingSimulation
    ? 'Retrying...'
    : signable && !expired
      ? 'Retry'
      : 'Retry simulation';
  return (
    <footer className="grid shrink-0 grid-cols-2 items-center gap-3 border-t border-line bg-bg-2 px-5 py-4 sm:flex sm:px-7">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="min-h-12 min-w-0 rounded-xl border border-transparent px-4 font-medium text-ink-dim transition-colors hover:bg-surface-elevated hover:text-ink disabled:opacity-40 sm:min-w-28 sm:px-5"
      >
        Cancel
      </button>
      <div className="hidden flex-1 sm:block" />
      <button
        type="button"
        onClick={() => void onRetry()}
        disabled={busy}
        aria-busy={isRetryingSimulation}
        className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-line-hi bg-surface px-4 font-medium text-ink transition-colors hover:bg-surface-elevated disabled:opacity-40 sm:min-w-32 sm:px-5"
      >
        {isRetryingSimulation ? (
          <Loader className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {retryLabel}
      </button>
      {signable && !expired && (
        <button
          type="button"
          onClick={() =>
            void onConfirm(
              preview.status === 'warning' ? preview.riskHash : undefined,
            )
          }
          disabled={!canSign}
          aria-busy={isSigningAndSending}
          className="col-span-2 flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-6 font-semibold text-[#221c0f] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-faint disabled:opacity-100 sm:min-w-40"
        >
          {isSigningAndSending ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {signingActionLabel(isSigningAndSending, batchExecutionPhase)}
        </button>
      )}
    </footer>
  );
}

export function TenderlyPreviewModal({
  isOpen,
  onClose,
  previewData,
  onConfirm,
  onRetry,
  onUpdateApproval,
  isSigningAndSending,
  batchExecutionPhase = 'idle',
  isRetryingSimulation,
  retryError,
}: TenderlyPreviewModalProps): ReactElement {
  const isExpired = usePreviewExpiry(previewData, isOpen);

  if (!previewData) return <></>;

  const signable =
    previewData.status === 'passed' || previewData.status === 'warning';
  const expired = signable && isExpired;
  const busy = isSigningAndSending || isRetryingSimulation;
  const canSign = signable && !expired && !busy;
  const outgoing = previewData.assetChanges.filter(
    (change) => change.direction === 'out',
  );
  const incoming = previewData.assetChanges.filter(
    (change) => change.direction === 'in',
  );
  const blockingReason = getBlockingReason(previewData);

  return (
    <Modal
      isOpen={isOpen}
      unframed
      onClose={busy ? noop : onClose}
      maxWidth="2xl"
    >
      <ModalContent className="">
        <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-line bg-bg shadow-2xl shadow-black/60">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-bg-2 px-5 py-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink">Transaction review</div>
                <div className="truncate font-mono text-xs text-ink-dim">
                  {formatAddress(previewData.walletAddress)}
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close transaction review"
              onClick={onClose}
              disabled={busy}
              className="grid h-10 w-10 place-items-center rounded-full text-ink-dim transition-colors hover:bg-surface-elevated hover:text-ink disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <motion.div
            variants={sectionStagger}
            initial="initial"
            animate="animate"
            className="overflow-y-auto px-5 py-6 sm:px-7"
          >
            <motion.div variants={fadeInUp} transition={SMOOTH_TRANSITION}>
              <ReviewMetaRow preview={previewData} expired={expired} />
            </motion.div>

            {blockingReason && (
              <motion.div
                variants={fadeInUp}
                transition={SMOOTH_TRANSITION}
                className="mt-5"
              >
                <BlockingBanner
                  failed={previewData.status === 'failed'}
                  reason={blockingReason}
                />
              </motion.div>
            )}

            <motion.div
              variants={fadeInUp}
              transition={SMOOTH_TRANSITION}
              className="mt-5"
            >
              <NetFlow outgoing={outgoing} incoming={incoming} />
            </motion.div>

            <motion.div
              variants={fadeInUp}
              transition={SMOOTH_TRANSITION}
              className="mt-6"
            >
              <Eyebrow className="mb-3 block">Execution timeline</Eyebrow>
              <div className="space-y-2">
                {previewData.calls.map((call, index) => (
                  <ExecutionStep
                    key={call.index}
                    preview={previewData}
                    call={call}
                    isLast={index === previewData.calls.length - 1}
                    onUpdateApproval={onUpdateApproval}
                    isUpdating={isRetryingSimulation}
                  />
                ))}
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              transition={SMOOTH_TRANSITION}
              className="mt-5"
            >
              <TenderlyEvidence
                preview={previewData}
                signable={signable}
                expired={expired}
              />
            </motion.div>

            {expired && (
              <div className="mt-5 rounded-2xl border border-error/25 bg-error/[0.06] p-3 text-center text-xs text-error">
                This preview has expired. Retry simulation before signing.
              </div>
            )}

            {retryError && (
              <div
                role="alert"
                className="mt-5 rounded-2xl border border-accent/25 bg-accent-soft p-3 text-center text-xs text-accent"
              >
                <span className="font-semibold">Retry failed: </span>
                {retryError}
              </div>
            )}
          </motion.div>

          <ReviewActions
            preview={previewData}
            signable={signable}
            expired={expired}
            busy={busy}
            canSign={canSign}
            isSigningAndSending={isSigningAndSending}
            batchExecutionPhase={batchExecutionPhase}
            isRetryingSimulation={isRetryingSimulation}
            onClose={onClose}
            onRetry={onRetry}
            onConfirm={onConfirm}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
