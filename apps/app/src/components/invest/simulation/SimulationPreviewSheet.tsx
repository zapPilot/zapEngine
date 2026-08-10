import type { SimulationPreviewRenderProps } from '@zapengine/app-core/hooks/wallet/useAtomicBatchExecution';
import {
  Activity,
  Check,
  Clock3,
  CloudOff,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SimulationApprovalCard } from '@/components/invest/simulation/SimulationApprovalCard';
import { SimulationAssetRows } from '@/components/invest/simulation/SimulationAssetRows';
import { SimulationCallList } from '@/components/invest/simulation/SimulationCallList';
import {
  SectionLabel,
  SimulationBlockingBanner,
  VERDICT_CLASSES,
  VERDICT_TEXT_CLASSES,
} from '@/components/invest/simulation/SimulationReviewPrimitives';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import { useReducedMotion } from '@/components/ui/useReducedMotion';
import {
  confirmGate,
  confirmRiskHash,
  formatAddress,
  formatCountdown,
  formatInteger,
  getBlockingReason,
  partitionAssetChanges,
  signingActionLabel,
  simulationChainLabel,
  titleCase,
  verdictMeta,
  type SimulationVerdictTone,
} from '@/integration/simulationPreviewModel';

// The unified invest route renders the same wallet-neutral review body
// inline. Keep this export next to the legacy modal wrapper so other flows can
// continue importing the sheet while Step 2 embeds the body directly.
export {
  SimulationReviewBody,
  type SimulationReviewBodyProps,
} from '@/components/invest/simulation/SimulationReviewBody';

function VerdictIcon({ tone }: { tone: SimulationVerdictTone }) {
  if (tone === 'success') return <ShieldCheck size={14} color="#7ad88f" />;
  if (tone === 'error') return <XCircle size={14} color="#ff6f61" />;
  return <CloudOff size={14} color="#a1a1aa" />;
}

function BlockingBanner({
  failed,
  reason,
}: {
  failed: boolean;
  reason: string;
}) {
  return <SimulationBlockingBanner failed={failed} reason={reason} />;
}

function TenderlyEvidence({
  preview,
}: {
  preview: SimulationPreviewRenderProps['previewData'];
}) {
  return (
    <View className="overflow-hidden rounded-2xl border border-line bg-surface">
      <View className="flex-row items-start gap-3 border-b border-line px-4 py-4">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-success/10">
          <ShieldCheck size={17} color="#7ad88f" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-[12px] text-ink">
            Independently simulated by Tenderly
          </Text>
          <Text className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
            {preview.calls.length}{' '}
            {preview.calls.length === 1 ? 'call' : 'calls'} executed in order as
            one stateful bundle.
          </Text>
        </View>
      </View>

      <View className="gap-3 px-4 py-4">
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
              Block
            </Text>
            <Text className="mt-1 font-mono text-[10px] text-ink-dim">
              {preview.blockNumber?.toLocaleString('en-US') ?? 'Unavailable'}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
              Call gas
            </Text>
            <Text className="mt-1 font-mono text-[10px] text-ink-dim">
              {formatInteger(preview.callGas)}
            </Text>
          </View>
        </View>

        {preview.shareUrls.length > 0 ? (
          <View className="gap-2 border-t border-line pt-3">
            <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
              Public simulation results
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {preview.shareUrls.map((url, index) => (
                <Tap
                  key={`${url}-${index}`}
                  accessibilityLabel={`View simulation ${index + 1} on Tenderly`}
                  accessibilityRole="link"
                  className="min-h-9 max-w-full flex-row items-center gap-2 rounded-xl border border-line-hi bg-bg px-3"
                  onPress={() => void Linking.openURL(url)}
                >
                  <ExternalLink size={13} color="#d4c5a3" />
                  <Text
                    className="max-w-[230px] font-sans-semibold text-[10px] text-accent"
                    numberOfLines={1}
                  >
                    Step {index + 1} ·{' '}
                    {titleCase(preview.calls[index]?.method ?? null)}
                  </Text>
                </Tap>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RetryButton({
  fullWidth = false,
  disabled,
  retrying,
  longLabel,
  onRetry,
}: {
  fullWidth?: boolean;
  disabled: boolean;
  retrying: boolean;
  longLabel: boolean;
  onRetry: () => Promise<void>;
}) {
  return (
    <PrimaryButton
      accessibilityLabel={longLabel ? 'Retry simulation' : 'Retry'}
      className={fullWidth ? 'w-full' : 'flex-1'}
      disabled={disabled}
      variant="secondary"
      onPress={() => void onRetry()}
    >
      {retrying ? (
        <ActivityIndicator color="#d4c5a3" size="small" />
      ) : (
        <RefreshCw size={15} color="#d4c5a3" />
      )}
      {retrying ? 'Retrying…' : longLabel ? 'Retry simulation' : 'Retry'}
    </PrimaryButton>
  );
}

export function SimulationPreviewSheet({
  isOpen,
  onClose,
  previewData,
  onConfirm,
  onRetry,
  onUpdateApproval,
  isSigningAndSending,
  batchExecutionPhase,
  isRetryingSimulation,
  retryError,
}: SimulationPreviewRenderProps) {
  const insets = useSafeAreaInsets();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [riskReview, setRiskReview] = useState(() => ({
    simulationFingerprint: previewData.simulationFingerprint,
    riskHash: previewData.riskHash,
    changed: false,
  }));
  const reduceMotion = useReducedMotion();

  if (
    riskReview.simulationFingerprint !== previewData.simulationFingerprint ||
    riskReview.riskHash !== previewData.riskHash
  ) {
    setRiskReview({
      simulationFingerprint: previewData.simulationFingerprint,
      riskHash: previewData.riskHash,
      changed: true,
    });
  }

  const signable =
    previewData.status === 'passed' || previewData.status === 'warning';
  const busy = isSigningAndSending || isRetryingSimulation;
  const gate = confirmGate(previewData, {
    nowMs,
    busy,
  });

  useEffect(() => {
    if (!isOpen || !signable) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen, previewData.riskHash, signable]);

  const verdict = verdictMeta(previewData);
  const blockingReason = getBlockingReason(previewData);
  const { incoming, outgoing } = partitionAssetChanges(
    previewData.assetChanges,
  );
  const close = busy ? undefined : onClose;
  const blocked = blockingReason !== null;
  const retryLongLabel = blocked || gate.expired;

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={close}
      transparent
      visible={isOpen}
    >
      <View className="flex-1 justify-end bg-[rgba(0,0,0,.68)]">
        <Pressable
          accessibilityLabel="Close transaction review"
          accessibilityRole="button"
          className="absolute inset-0"
          disabled={busy}
          onPress={onClose}
        />

        <View
          aria-label="Transaction review"
          aria-modal
          accessible
          accessibilityLabel="Transaction review"
          accessibilityViewIsModal
          role="dialog"
          className="w-full max-w-[640px] self-center overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-bg shadow-lg"
          style={{ height: '94%', maxHeight: 880 }}
        >
          <View className="flex-row items-center justify-between gap-4 border-b border-line bg-bg-2 px-5 py-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl border border-accent/30 bg-accent-soft">
                <Wallet size={18} color="#d4c5a3" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-sans-semibold text-[14px] text-ink">
                  Transaction review
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] text-ink-dim">
                  {formatAddress(previewData.walletAddress)}
                </Text>
              </View>
            </View>
            <Tap
              accessibilityLabel="Close transaction review"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full bg-[rgba(255,255,255,.04)]"
              disabled={busy}
              onPress={onClose}
            >
              <X size={17} color="#a1a1aa" />
            </Tap>
          </View>

          <ScrollView
            className="min-h-0 flex-1"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-5 px-5 pt-5">
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <View
                  className={`flex-row items-center gap-2 rounded-full border px-3 py-1.5 ${VERDICT_CLASSES[verdict.tone]}`}
                >
                  <VerdictIcon tone={verdict.tone} />
                  <Text
                    className={`font-sans-semibold text-[11px] ${VERDICT_TEXT_CLASSES[verdict.tone]}`}
                  >
                    {verdict.label}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  {signable ? (
                    <View className="flex-row items-center gap-1.5">
                      <Clock3 size={13} color="#a1a1aa" />
                      <Text className="font-mono text-[9.5px] text-ink-dim">
                        {formatCountdown(previewData.expiresAt, nowMs)}
                      </Text>
                    </View>
                  ) : null}
                  <View className="flex-row items-center gap-2 rounded-full border border-line px-3 py-1.5">
                    <Text className="font-sans-medium text-[10.5px] text-ink">
                      {simulationChainLabel(previewData.chainId)}
                    </Text>
                    <View className="h-2 w-2 rounded-full bg-usd" />
                  </View>
                </View>
              </View>

              {blockingReason ? (
                <BlockingBanner
                  failed={previewData.status === 'failed'}
                  reason={blockingReason}
                />
              ) : null}

              {riskReview.changed ? (
                <View
                  accessibilityRole="alert"
                  className="flex-row items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4"
                >
                  <Activity size={17} color="#d4c5a3" />
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-semibold text-[12px] text-accent">
                      Simulation changed — review again
                    </Text>
                    <Text className="mt-1 text-[10.5px] leading-4 text-ink-dim">
                      Calls, approvals, or risk evidence changed after the last
                      review.
                    </Text>
                  </View>
                </View>
              ) : null}

              <View>
                <SectionLabel>Net flow</SectionLabel>
                <SimulationAssetRows outgoing={outgoing} incoming={incoming} />
              </View>

              {previewData.approvals.length > 0 ? (
                <View>
                  <SectionLabel>Approvals</SectionLabel>
                  <View className="gap-3">
                    {previewData.approvals.map((approval) => (
                      <SimulationApprovalCard
                        key={`${previewData.riskHash}-${approval.callIndex}-${approval.rawAmount}`}
                        approval={approval}
                        contracts={previewData.contracts}
                        disabled={busy}
                        onUpdateApproval={onUpdateApproval}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {retryError ? (
                <View
                  accessibilityRole="alert"
                  className="rounded-2xl border border-error/30 bg-error/10 p-3"
                >
                  <Text className="font-sans-semibold text-[11px] text-error">
                    Simulation retry failed
                  </Text>
                  <Text className="mt-1 text-[10.5px] leading-4 text-error">
                    {retryError}
                  </Text>
                </View>
              ) : null}

              <View>
                <SectionLabel>Execution</SectionLabel>
                <SimulationCallList
                  calls={previewData.calls}
                  contracts={previewData.contracts}
                  approvals={previewData.approvals}
                />
              </View>

              <View>
                <SectionLabel>Evidence</SectionLabel>
                <TenderlyEvidence preview={previewData} />
              </View>

              {gate.expired ? (
                <View
                  accessibilityRole="alert"
                  className="rounded-2xl border border-error/30 bg-error/10 p-3"
                >
                  <Text className="text-center font-sans-semibold text-[11px] text-error">
                    This preview has expired. Retry simulation before signing.
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            className="border-t border-line bg-bg-2 px-5 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 20) }}
          >
            {gate.expired ? (
              <RetryButton
                fullWidth
                disabled={busy}
                retrying={isRetryingSimulation}
                longLabel
                onRetry={onRetry}
              />
            ) : (
              <>
                <View className="flex-row gap-3">
                  <PrimaryButton
                    accessibilityLabel="Cancel transaction"
                    className="flex-1"
                    disabled={busy}
                    variant="secondary"
                    onPress={onClose}
                  >
                    Cancel
                  </PrimaryButton>
                  <RetryButton
                    disabled={busy}
                    retrying={isRetryingSimulation}
                    longLabel={retryLongLabel}
                    onRetry={onRetry}
                  />
                </View>

                {signable ? (
                  <View className="mt-3">
                    <PrimaryButton
                      accessibilityLabel={signingActionLabel(
                        batchExecutionPhase,
                      )}
                      disabled={!gate.canConfirm}
                      onPress={() =>
                        void onConfirm(confirmRiskHash(previewData))
                      }
                    >
                      {isSigningAndSending ? (
                        <ActivityIndicator color="#221c0f" size="small" />
                      ) : (
                        <Check size={15} color="#221c0f" />
                      )}
                      {signingActionLabel(batchExecutionPhase)}
                    </PrimaryButton>
                    <Text className="mt-2 text-center text-[9.5px] leading-4 text-ink-faint">
                      Sign &amp; Send starts wallet signing immediately, then
                      submits this batch.
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
