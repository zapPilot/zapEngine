import type { PrivyPrepareSendCallsResponse } from '@zapengine/types/api';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Loader,
  RefreshCw,
  Wallet,
  X,
} from 'lucide-react';
import { type MouseEvent, type ReactElement, useEffect, useState } from 'react';

import { Modal, ModalContent } from '@/components/ui/modal';

interface TenderlyPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: PrivyPrepareSendCallsResponse | null;
  onConfirm: (acknowledgedRiskHash?: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onUpdateApproval: (callIndex: number, amount: string) => Promise<void>;
  isSigningAndSending: boolean;
  isRetryingSimulation: boolean;
  retryError?: string | null;
}

type PreviewCall = PrivyPrepareSendCallsResponse['calls'][number];
type AssetChange = PrivyPrepareSendCallsResponse['assetChanges'][number];

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

function networkName(chainId: number): string {
  if (chainId === 8453) return 'Base';
  if (chainId === 42161) return 'Arbitrum';
  return `Chain ${chainId}`;
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

function TokenMark({ change }: { change: AssetChange }): ReactElement {
  if (change.token.logoUrl) {
    return (
      <img
        src={change.token.logoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full bg-slate-800 object-cover"
      />
    );
  }
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-xs font-bold text-slate-200">
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
    <div className="flex min-h-16 items-center justify-between gap-4 border-t border-slate-800/80 px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TokenMark change={change} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {change.token.symbol}
          </div>
          <div className="truncate text-xs text-slate-500">
            {change.token.name}
          </div>
        </div>
      </div>
      <div
        title={`${sign}${exactAmount} ${change.token.symbol}`}
        className={`max-w-[55%] min-w-0 shrink truncate text-right font-mono text-sm font-semibold ${outgoing ? 'text-rose-300' : 'text-emerald-300'}`}
      >
        {sign}
        {compactTokenAmount(change.rawAmount, change.token.decimals)}{' '}
        {change.token.symbol}
      </div>
    </div>
  );
}

function AssetPanel({
  title,
  changes,
  direction,
}: {
  title: string;
  changes: AssetChange[];
  direction: 'out' | 'in';
}): ReactElement {
  const Icon = direction === 'out' ? ArrowUpRight : ArrowDownLeft;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/40 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {changes.length > 0 ? (
        changes.map((change, index) => (
          <AssetRow
            key={`${direction}-${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
            change={change}
          />
        ))
      ) : (
        <div className="px-4 py-5 text-sm text-slate-500">
          No assets detected
        </div>
      )}
    </section>
  );
}

function StepIcon({ status }: { status: PreviewCall['status'] }): ReactElement {
  if (status === 'succeeded') {
    return <Check className="h-5 w-5 text-emerald-300" />;
  }
  if (status === 'failed') {
    return <X className="h-5 w-5 text-rose-300" />;
  }
  return <CircleDashed className="h-5 w-5 text-slate-500" />;
}

function ExecutionStep({
  preview,
  call,
  onUpdateApproval,
  isUpdating,
}: {
  preview: PrivyPrepareSendCallsResponse;
  call: PreviewCall;
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

  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 open:bg-slate-900">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-4 py-3 marker:hidden sm:px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-950">
          <StepIcon status={call.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-100">
              {titleCase(call.method)}
            </span>
            <span className="text-sm text-slate-400">
              to {callTarget(preview, call)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Step {call.index + 1} of {preview.calls.length}
          </div>
        </div>
        {approval && (
          <div className="flex max-w-[42%] min-w-0 shrink-0 flex-col items-end gap-1 sm:max-w-[48%] sm:flex-row sm:items-center sm:gap-2">
            <span className="max-w-full truncate font-mono text-xs font-semibold text-amber-200 sm:text-sm">
              {approval.unlimited
                ? 'Unlimited'
                : compactTokenAmount(
                    approval.rawAmount,
                    approval.token.decimals,
                  )}{' '}
              {approval.token.symbol}
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-400/10"
            >
              Edit
            </button>
          </div>
        )}
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-slate-800 px-5 py-4 text-xs sm:grid-cols-3">
        {approval && (
          <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 sm:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-amber-200">
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
                  className="rounded-lg px-2 py-1 font-semibold text-indigo-300 hover:bg-indigo-400/10 sm:hidden"
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
                  void (async () => {
                    try {
                      await onUpdateApproval(call.index, approvalAmount);
                      setEditingApproval(false);
                    } catch {
                      // Approval update errors are surfaced via onUpdateApproval itself.
                    }
                  })();
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
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none focus:border-indigo-400"
                />
                <button
                  type="submit"
                  disabled={isUpdating || approvalAmount.trim() === ''}
                  className="min-h-10 rounded-lg bg-indigo-500 px-4 font-semibold text-white disabled:opacity-40"
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
              <div className="text-amber-300/80">
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
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-rose-200 sm:col-span-3">
            {call.error}
          </div>
        )}
        <div className="space-y-3 border-t border-slate-800 pt-4 sm:col-span-3">
          <div className="font-semibold uppercase tracking-[0.14em] text-slate-400">
            Raw data
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Interacting with (to)
            </div>
            <div className="mt-1 break-all font-mono text-slate-300">
              {call.to}
            </div>
          </div>
          <Evidence label="Value to be sent" value={call.value} />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Data
            </div>
            <div className="mt-1 break-all font-mono text-slate-400">
              {call.data}
            </div>
          </div>
        </div>
      </div>
    </details>
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-xs text-slate-300">
        {value}
      </div>
    </div>
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
  isRetryingSimulation,
  retryError,
}: TenderlyPreviewModalProps): ReactElement {
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={
        busy
          ? () => {
              /* noop: prevent close while transaction is pending */
            }
          : onClose
      }
      maxWidth="2xl"
    >
      <ModalContent className="flex max-h-[92vh] flex-col overflow-hidden rounded-[28px] border border-slate-800 bg-[#090d16] p-0 shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/70 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/50">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-100">
                Transaction review
              </div>
              <div className="truncate font-mono text-xs text-slate-400">
                {formatAddress(previewData.walletAddress)}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close transaction review"
            onClick={onClose}
            disabled={busy}
            className="grid h-10 w-10 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Overview
            </h2>
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200">
              <span>on {networkName(previewData.chainId)}</span>
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-blue-500/10" />
            </div>
          </div>

          <section className="space-y-3">
            {previewData.calls.map((call) => (
              <ExecutionStep
                key={call.index}
                preview={previewData}
                call={call}
                onUpdateApproval={onUpdateApproval}
                isUpdating={isRetryingSimulation}
              />
            ))}
          </section>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <AssetPanel title="Assets out" changes={outgoing} direction="out" />
            <AssetPanel title="Assets in" changes={incoming} direction="in" />
          </div>

          <details className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/30">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Advanced details
            </summary>
            <div className="space-y-4 border-t border-slate-800 px-4 py-4">
              {previewData.shareUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                  {previewData.shareUrls.map((url, index) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View simulation ${index + 1} on Tenderly`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-400/[0.07] px-3 text-xs font-semibold text-indigo-200 transition-colors hover:border-indigo-300/50 hover:bg-indigo-400/15"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {previewData.shareUrls.length === 1
                        ? 'View on Tenderly'
                        : `Simulation ${index + 1}`}
                    </a>
                  ))}
                </div>
              )}
              <div
                className={`grid gap-4 ${signable ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
              >
                <Evidence
                  label="Network"
                  value={networkName(previewData.chainId)}
                />
                <Evidence
                  label="Block"
                  value={
                    previewData.blockNumber?.toLocaleString() ?? 'Unavailable'
                  }
                />
                <Evidence
                  label="Call gas"
                  value={Number(previewData.callGas).toLocaleString()}
                />
                {signable && (
                  <Evidence
                    label="Expires"
                    value={
                      expired ? 'Expired' : formatExpiry(previewData.expiresAt)
                    }
                  />
                )}
              </div>
              <div className="border-t border-slate-800 pt-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Simulation fingerprint
                </div>
                <div className="mt-1 break-all font-mono text-xs text-slate-400">
                  {previewData.simulationFingerprint}
                </div>
              </div>
            </div>
          </details>

          {expired && (
            <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-center text-xs text-rose-300">
              This preview has expired. Retry simulation before signing.
            </div>
          )}

          {retryError && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-center text-xs text-amber-300"
            >
              <span className="font-semibold">Retry failed: </span>
              {retryError}
            </div>
          )}
        </div>

        <footer className="grid grid-cols-2 items-center gap-3 border-t border-slate-800 bg-slate-900/80 px-5 py-4 backdrop-blur sm:flex sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-12 min-w-0 rounded-xl border border-rose-400/40 px-4 font-medium text-rose-300 transition-colors hover:bg-rose-400/10 disabled:opacity-40 sm:min-w-28 sm:px-5"
          >
            Cancel
          </button>
          <div className="hidden flex-1 sm:block" />
          <button
            type="button"
            onClick={() => void onRetry()}
            disabled={busy}
            className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40 sm:min-w-32 sm:px-5"
          >
            {isRetryingSimulation ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRetryingSimulation
              ? 'Retrying...'
              : signable && !expired
                ? 'Retry'
                : 'Retry simulation'}
          </button>
          {signable && !expired && (
            <button
              type="button"
              onClick={() =>
                void onConfirm(
                  previewData.status === 'warning'
                    ? previewData.riskHash
                    : undefined,
                )
              }
              disabled={!canSign}
              className="col-span-2 flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 font-semibold text-white shadow-lg shadow-indigo-950/50 transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none sm:min-w-40"
            >
              {isSigningAndSending ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isSigningAndSending ? 'Signing...' : 'Sign & Send'}
            </button>
          )}
        </footer>
      </ModalContent>
    </Modal>
  );
}
