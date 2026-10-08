import { palette } from '@/lib/palette';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { SimulationPreviewRenderProps } from '@zapengine/app-core/hooks/wallet/useAtomicBatchExecution';
import {
  Activity,
  Check,
  Clock3,
  CloudOff,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  SimulationBlockingBanner,
  SimulationEvidenceStats,
  SimulationShareLinks,
  VERDICT_CLASSES,
  VERDICT_TEXT_CLASSES,
} from '@/components/invest/simulation/SimulationReviewPrimitives';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import { useReducedMotion } from '@/components/ui/useReducedMotion';
import {
  confirmGate,
  confirmRiskHash,
  formatAddressOrUnknown,
  formatCountdown,
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
  if (tone === 'success')
    return <Icon icon={ShieldCheck} size="xs" tone="default" />;
  if (tone === 'error') return <Icon icon={XCircle} size="xs" tone="alert" />;
  return <Icon icon={CloudOff} size="xs" tone="secondary" />;
}

function TenderlyEvidence({
  preview,
}: {
  preview: SimulationPreviewRenderProps['previewData'];
}) {
  return (
    <View className="overflow-hidden rounded-panel border border-rule bg-sheet">
      <View className="flex-row items-start gap-3 border-b border-rule px-4 py-4">
        <View className="h-9 w-9 items-center justify-center rounded-panel bg-ink/10">
          <Icon icon={ShieldCheck} size="md" tone="default" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-text-semibold text-caption text-ink">
            Independently simulated by Tenderly
          </Text>
          <Text className="font-mono-medium mt-0.5 text-label leading-4 text-ink-2">
            {preview.calls.length}{' '}
            {preview.calls.length === 1 ? 'call' : 'calls'} executed in order as
            one stateful bundle.
          </Text>
        </View>
      </View>

      <View className="gap-3 px-4 py-4">
        <SimulationEvidenceStats
          blockNumber={preview.blockNumber}
          callGas={preview.callGas}
        />
        <SimulationShareLinks
          shareUrls={preview.shareUrls}
          label={(index) =>
            `Step ${index + 1} · ${titleCase(preview.calls[index]?.method ?? null)}`
          }
        />
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
    <Button
      accessibilityLabel={longLabel ? 'Retry simulation' : 'Retry'}
      className={fullWidth ? 'w-full' : 'flex-1'}
      disabled={disabled}
      variant="secondary"
      onPress={() => void onRetry()}
    >
      {retrying ? (
        <ActivityIndicator color={palette['sign-ink']} size="small" />
      ) : (
        <Icon icon={RefreshCw} size="sm" tone="sign" />
      )}
      {retrying ? 'Retrying…' : longLabel ? 'Retry simulation' : 'Retry'}
    </Button>
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
      <View className="flex-1 justify-end bg-well">
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
          className="w-full max-w-[640px] self-center overflow-hidden rounded-t-[28px] border border-b-0 border-rule bg-ground shadow-lg"
          style={{ height: '94%', maxHeight: 880 }}
        >
          <View className="flex-row items-center justify-between gap-4 border-b border-rule bg-sheet px-5 py-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-panel border border-sign/30 bg-sign-wash">
                <Icon icon={Wallet} size="md" tone="sign" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-text-semibold text-body text-ink">
                  Transaction review
                </Text>
                <Text className="mt-0.5 font-mono text-data text-ink-2">
                  {formatAddressOrUnknown(previewData.walletAddress)}
                </Text>
              </View>
            </View>
            <Tap
              accessibilityLabel="Close transaction review"
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-round bg-well"
              disabled={busy}
              onPress={onClose}
            >
              <Icon icon={X} size="md" tone="secondary" />
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
                  className={cn(
                    'flex-row items-center gap-2 rounded-round border px-3 py-1.5',
                    VERDICT_CLASSES[verdict.tone],
                  )}
                >
                  <VerdictIcon tone={verdict.tone} />
                  <Text
                    className={cn(
                      'font-text-semibold text-label',
                      VERDICT_TEXT_CLASSES[verdict.tone],
                    )}
                  >
                    {verdict.label}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  {signable ? (
                    <View className="flex-row items-center gap-1.5">
                      <Icon icon={Clock3} size="xs" tone="secondary" />
                      <Text className="font-mono text-data text-ink-2">
                        {formatCountdown(previewData.expiresAt, nowMs)}
                      </Text>
                    </View>
                  ) : null}
                  <View className="flex-row items-center gap-2 rounded-round border border-rule px-3 py-1.5">
                    <Text className="font-text-medium text-label text-ink">
                      {simulationChainLabel(previewData.chainId)}
                    </Text>
                    <View className="h-2 w-2 rounded-round bg-sleeve-stable" />
                  </View>
                </View>
              </View>

              {blockingReason ? (
                <SimulationBlockingBanner
                  failed={previewData.status === 'failed'}
                  reason={blockingReason}
                />
              ) : null}

              {riskReview.changed ? (
                <View
                  accessibilityRole="alert"
                  className="flex-row items-start gap-3 rounded-panel border border-sign/30 bg-sign-wash p-4"
                >
                  <Icon icon={Activity} size="md" tone="sign" />
                  <View className="min-w-0 flex-1">
                    <Text className="font-text-semibold text-caption text-sign-ink">
                      Simulation changed — review again
                    </Text>
                    <Text className="font-mono-medium mt-1 text-label leading-4 text-ink-2">
                      Calls, approvals, or risk evidence changed after the last
                      review.
                    </Text>
                  </View>
                </View>
              ) : null}

              <View>
                <SectionHeader title={<> Net flow </>} />
                <SimulationAssetRows outgoing={outgoing} incoming={incoming} />
              </View>

              {previewData.approvals.length > 0 ? (
                <View>
                  <SectionHeader title={<> Approvals </>} />
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
                  className="rounded-panel border border-alert bg-alert-wash p-3"
                >
                  <Text className="font-text-semibold text-label text-alert">
                    Simulation retry failed
                  </Text>
                  <Text className="font-mono-medium mt-1 text-label leading-4 text-alert">
                    {retryError}
                  </Text>
                </View>
              ) : null}

              <View>
                <SectionHeader title={<> Execution </>} />
                <SimulationCallList
                  calls={previewData.calls}
                  contracts={previewData.contracts}
                  approvals={previewData.approvals}
                />
              </View>

              <View>
                <SectionHeader title={<> Evidence </>} />
                <TenderlyEvidence preview={previewData} />
              </View>

              {gate.expired ? (
                <View
                  accessibilityRole="alert"
                  className="rounded-panel border border-alert bg-alert-wash p-3"
                >
                  <Text className="text-center font-text-semibold text-label text-alert">
                    This preview has expired. Retry simulation before signing.
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View
            className="border-t border-rule bg-sheet px-5 pt-4"
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
                  <Button
                    accessibilityLabel="Cancel transaction"
                    className="flex-1"
                    disabled={busy}
                    variant="secondary"
                    onPress={onClose}
                  >
                    Cancel
                  </Button>
                  <RetryButton
                    disabled={busy}
                    retrying={isRetryingSimulation}
                    longLabel={retryLongLabel}
                    onRetry={onRetry}
                  />
                </View>

                {signable ? (
                  <View className="mt-3">
                    <Button
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
                        <Icon icon={Check} size="sm" tone="default" />
                      )}
                      {signingActionLabel(batchExecutionPhase)}
                    </Button>
                    <Text className="font-mono-medium mt-2 text-center text-label leading-4 text-ink-3">
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
