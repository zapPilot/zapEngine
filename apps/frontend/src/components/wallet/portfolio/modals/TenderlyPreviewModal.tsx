import type { PrivyPrepareSendCallsResponse } from '@zapengine/types/api';
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ExternalLink,
  Loader,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Modal, ModalContent } from '@/components/ui/modal';

interface TenderlyPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: PrivyPrepareSendCallsResponse | null;
  onConfirm: (acknowledgedRiskHash?: string) => Promise<void>;
  onRetry: () => Promise<void>;
  isSigningAndSending: boolean;
  isRetryingSimulation: boolean;
}

function formatAddress(address: string | null): string {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(rawAmount: string, decimals: number): string {
  try {
    const negative = rawAmount.startsWith('-');
    const digits = negative ? rawAmount.slice(1) : rawAmount;
    const padded = digits.padStart(decimals + 1, '0');
    const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
    const fraction =
      decimals === 0 ? '' : padded.slice(-decimals).replace(/0+$/, '');
    return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return rawAmount;
  }
}

function networkName(chainId: number): string {
  if (chainId === 8453) return 'Base';
  if (chainId === 42161) return 'Arbitrum';
  return `Chain ${chainId}`;
}

function statusContent(preview: PrivyPrepareSendCallsResponse): {
  title: string;
  detail: string;
  tone: string;
  icon: ReactElement;
} {
  if (preview.status === 'passed') {
    return {
      title: 'Simulation passed',
      detail: 'All calls completed without material risk warnings.',
      tone: 'border-emerald-500/25 bg-emerald-950/20 text-emerald-400',
      icon: <CheckCircle className="h-5 w-5 shrink-0" />,
    };
  }
  if (preview.status === 'warning') {
    return {
      title: 'Review warnings before signing',
      detail: 'The bundle simulated successfully but requires acknowledgement.',
      tone: 'border-amber-500/25 bg-amber-950/20 text-amber-400',
      icon: <AlertTriangle className="h-5 w-5 shrink-0" />,
    };
  }
  if (preview.status === 'failed') {
    return {
      title: 'Simulation failed',
      detail: preview.failureReason,
      tone: 'border-rose-500/25 bg-rose-950/20 text-rose-400',
      icon: <XCircle className="h-5 w-5 shrink-0" />,
    };
  }
  return {
    title: 'Simulation unavailable',
    detail: preview.unavailableReason,
    tone: 'border-gray-600 bg-gray-900/40 text-gray-300',
    icon: <ShieldAlert className="h-5 w-5 shrink-0" />,
  };
}

export function TenderlyPreviewModal({
  isOpen,
  onClose,
  previewData,
  onConfirm,
  onRetry,
  isSigningAndSending,
  isRetryingSimulation,
}: TenderlyPreviewModalProps): ReactElement {
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    setRiskAcknowledged(false);
  }, [previewData?.riskHash, previewData?.status]);

  if (!previewData) return <></>;

  const signable =
    previewData.status === 'passed' || previewData.status === 'warning';
  const expired = signable && Date.now() > previewData.expiresAt;
  const busy = isSigningAndSending || isRetryingSimulation;
  const canSign =
    signable &&
    !expired &&
    !busy &&
    (previewData.status !== 'warning' || riskAcknowledged);
  const status = statusContent(previewData);

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      maxWidth="lg"
    >
      <ModalContent className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-950 p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800/80 bg-gray-900/30 p-6">
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-200">
              Transaction review
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Tenderly EIP-7702 call simulation
            </div>
          </div>
          <button
            type="button"
            aria-label="Close transaction review"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] space-y-6 overflow-y-auto p-6">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 ${status.tone}`}
          >
            {status.icon}
            <div>
              <div className="text-sm font-bold">{status.title}</div>
              <div className="mt-1 text-xs text-gray-400">{status.detail}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Evidence
              label="Network"
              value={networkName(previewData.chainId)}
            />
            <Evidence
              label="Block"
              value={
                previewData.blockNumber === null
                  ? 'Unavailable'
                  : previewData.blockNumber.toLocaleString()
              }
            />
            <Evidence
              label="Simulated call gas"
              value={`${Number(previewData.callGas).toLocaleString()} units`}
              icon={<Zap className="h-4 w-4 text-indigo-400" />}
            />
          </div>

          <Section title="Wallet asset changes">
            {previewData.assetChanges.length === 0 ? (
              <EmptyState text="No wallet-relative asset changes detected." />
            ) : (
              previewData.assetChanges.map((change, index) => (
                <div
                  key={`${change.callIndex}-${change.token.address ?? change.token.symbol}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-gray-800/70 py-3 last:border-0"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-200">
                      {change.token.symbol}
                    </div>
                    <div className="text-xs text-gray-500">
                      {change.type} to {formatAddress(change.to)}
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      change.direction === 'out'
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {change.direction === 'out' ? '-' : '+'}
                    {formatTokenAmount(
                      change.rawAmount,
                      change.token.decimals,
                    )}{' '}
                    {change.token.symbol}
                  </div>
                </div>
              ))
            )}
          </Section>

          {previewData.approvals.length > 0 && (
            <Section title="Approval exposure">
              {previewData.approvals.map((approval) => (
                <div
                  key={`${approval.callIndex}-${approval.spender}`}
                  className="border-b border-gray-800/70 py-3 last:border-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-300">
                      {approval.token.symbol} to{' '}
                      {formatAddress(approval.spender)}
                    </span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {approval.unlimited
                        ? 'Unlimited'
                        : formatTokenAmount(
                            approval.rawAmount,
                            approval.token.decimals,
                          )}{' '}
                      {approval.token.symbol}
                    </span>
                  </div>
                  {approval.exceedsSimulatedSpend && (
                    <div className="mt-1 text-xs text-amber-400">
                      Approval exceeds simulated spend.
                    </div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {previewData.warnings.length > 0 && (
            <Section title="Warnings">
              <div className="space-y-2">
                {previewData.warnings.map((warning, index) => (
                  <div
                    key={`${warning.code}-${warning.callIndex ?? index}`}
                    className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-xs text-amber-200"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {warning.message}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Execution steps">
            <div className="space-y-2">
              {previewData.calls.map((call) => (
                <details
                  key={call.index}
                  className="rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-gray-200">
                    Call {call.index + 1}: {call.method ?? 'Unknown method'}
                  </summary>
                  <div className="mt-3 space-y-1 break-all font-mono text-xs text-gray-500">
                    <div>Target: {call.to}</div>
                    <div>Status: {call.status}</div>
                    <div>Value: {call.value}</div>
                    <div>Data: {call.data}</div>
                    {call.error && (
                      <div className="text-rose-400">{call.error}</div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </Section>

          {previewData.shareUrls.length > 0 && (
            <Section title="Public simulation details">
              <div className="space-y-2">
                {previewData.shareUrls.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-indigo-300 hover:text-indigo-200"
                  >
                    Tenderly simulation {index + 1}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ))}
                <p className="text-xs text-gray-500">
                  Public Tenderly details are accessible to anyone with the
                  link.
                </p>
              </div>
            </Section>
          )}

          {previewData.status === 'warning' && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-4">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(event) => setRiskAcknowledged(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm text-amber-100">
                I reviewed these warnings and accept the stated risks.
              </span>
            </label>
          )}

          {expired && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-3 text-center text-xs text-rose-400">
              This preview has expired. Retry simulation before signing.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-gray-800/80 bg-gray-900/20 p-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-w-28 flex-1 rounded-xl border border-gray-800 py-3 text-gray-300 hover:bg-gray-800/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onRetry()}
            disabled={busy}
            className="flex min-w-40 flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-500/30 py-3 text-indigo-200 hover:bg-indigo-950/30 disabled:opacity-50"
          >
            {isRetryingSimulation ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRetryingSimulation ? 'Retrying...' : 'Retry simulation'}
          </button>
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
            className="flex min-w-40 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSigningAndSending ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isSigningAndSending ? 'Sign & Send...' : 'Sign & Send'}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}

function Evidence({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactElement;
}): ReactElement {
  return (
    <div className="rounded-2xl border border-gray-800/70 bg-gray-900/30 p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-gray-200">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <section>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">
        {title}
      </h3>
      <div className="rounded-2xl border border-gray-800/80 bg-gray-900/20 px-4">
        {children}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }): ReactElement {
  return <div className="py-4 text-xs text-gray-500">{text}</div>;
}
