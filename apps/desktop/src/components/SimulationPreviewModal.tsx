import type { SimulationPreviewRenderProps } from '@zapengine/app-core/providers/WalletProvider';

import { PrimaryButton } from '@/components/ui/PrimaryButton';

/**
 * Minimal, on-brand batch-simulation preview. WalletProvider renders this via
 * `renderSimulationPreview` once a deposit batch has been simulated; confirming
 * signs and broadcasts. We intentionally do not deep-render `previewData` — the
 * shape is opaque and surfacing it raw is not the desktop's job.
 *
 * Every prop is optional-accessed so a partial render-prop payload never throws.
 */
export function SimulationPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  onRetry,
  isSigningAndSending,
  batchExecutionPhase,
  retryError,
}: Partial<SimulationPreviewRenderProps>) {
  if (!isOpen) {
    return null;
  }

  const signing = Boolean(isSigningAndSending);
  const phase = batchExecutionPhase && batchExecutionPhase !== 'idle';
  const statusLabel = signing || phase ? 'Signing…' : null;
  const hasRetryError = Boolean(retryError);

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center px-6"
      style={{ background: 'rgba(8,8,9,.72)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Review and sign"
    >
      <div
        className="w-full max-w-[300px] rounded-[20px] p-5 text-ink"
        style={{
          background: 'linear-gradient(180deg,#161618,#0e0e10)',
          border: '1px solid rgba(212,197,163,.28)',
        }}
      >
        <div className="font-serif text-[20px] leading-tight">
          Review & sign
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-dim">
          Confirm to sign and broadcast. Nothing moves until you approve in your
          wallet.
        </p>

        {statusLabel ? (
          <div className="mt-3 text-[11.5px] font-medium text-accent">
            {statusLabel}
          </div>
        ) : null}

        {hasRetryError ? (
          <div className="mt-3 text-[11.5px] text-error" role="alert">
            Simulation failed. You can retry the preview.
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5">
          <PrimaryButton
            disabled={signing}
            onClick={() => onConfirm?.()}
            style={signing ? { opacity: 0.7 } : undefined}
          >
            {signing ? 'Signing…' : 'Confirm & sign'}
          </PrimaryButton>

          {hasRetryError ? (
            <PrimaryButton
              variant="secondary"
              disabled={signing}
              onClick={() => onRetry?.()}
            >
              Retry
            </PrimaryButton>
          ) : null}

          <button
            type="button"
            onClick={() => onClose?.()}
            className="zp-tap w-full text-center text-[13px] font-medium"
            style={{ color: '#8a857a' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
