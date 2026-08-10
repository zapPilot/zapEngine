import type {
  DepositReviewGroup,
  ExecutionSimulationReview,
} from '@zapengine/types/api';
import {
  CloudOff,
  ExternalLink,
  ShieldCheck,
  XCircle,
} from 'lucide-react-native';
import { Linking, Text, View } from 'react-native';

import { SimulationAssetRows } from '@/components/invest/simulation/SimulationAssetRows';
import { SimulationCallList } from '@/components/invest/simulation/SimulationCallList';
import {
  SectionLabel,
  SimulationBlockingBanner,
  VERDICT_CLASSES,
  VERDICT_TEXT_CLASSES,
} from '@/components/invest/simulation/SimulationReviewPrimitives';
import { Tap } from '@/components/ui/Tap';
import {
  formatAddress,
  formatInteger,
  compactTokenAmount,
  partitionAssetChanges,
  simulationChainLabel,
  type SimulationVerdictTone,
} from '@/integration/simulationPreviewModel';

function verdict(review: ExecutionSimulationReview): {
  label: string;
  tone: SimulationVerdictTone;
} {
  switch (review.status) {
    case 'passed':
      return { label: 'All checks passed', tone: 'success' };
    case 'warning':
      return { label: 'Simulation ready', tone: 'success' };
    case 'failed':
      return { label: 'Simulation failed', tone: 'error' };
    case 'unavailable':
      return { label: 'Simulation unavailable', tone: 'neutral' };
  }
}

function ReadOnlyApproval({
  approval,
}: {
  approval: DepositReviewGroup['approvals'][number];
}) {
  return (
    <View className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-[13px] text-accent">
            Approve {approval.unlimited ? 'Unlimited' : approval.amount}{' '}
            {approval.token.symbol}
          </Text>
          <Text className="mt-1 text-[10px] text-ink-faint">
            Call {approval.callIndex + 1} · Read-only authoritative plan
          </Text>
        </View>
        {approval.unlimited ? (
          <View className="rounded-full border border-error/30 bg-error/10 px-2 py-0.5">
            <Text className="font-mono-semibold text-[8px] uppercase tracking-[.5px] text-error">
              Unlimited
            </Text>
          </View>
        ) : null}
      </View>
      <View className="mt-3 flex-row gap-4 border-t border-accent/15 pt-3">
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
            Spender
          </Text>
          <Text
            className="mt-1 font-mono text-[10px] text-ink"
            numberOfLines={1}
          >
            {formatAddress(approval.spender)}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
            Simulated spend
          </Text>
          <Text
            className="mt-1 font-mono text-[10px] text-ink"
            numberOfLines={1}
          >
            {compactTokenAmount(
              approval.simulatedSpendRaw,
              approval.token.decimals,
            )}{' '}
            {approval.token.symbol}
          </Text>
        </View>
      </View>
    </View>
  );
}

function BlockingBanner({ review }: { review: DepositReviewGroup }) {
  const failed = review.status === 'failed';
  const reason = failed
    ? review.failureReason
    : review.status === 'unavailable'
      ? review.unavailableReason
      : null;
  if (!reason) return null;
  return <SimulationBlockingBanner failed={failed} reason={reason} />;
}

export interface SimulationReviewBodyProps {
  review: DepositReviewGroup;
}

/**
 * Wallet-neutral Tenderly review content for the unified invest route.  It is
 * deliberately independent from the legacy Privy preview's signing envelope
 * so both Privy and external wallets render the same evidence in Step 2.
 */
export function SimulationReviewBody({ review }: SimulationReviewBodyProps) {
  const meta = verdict(review);
  const { incoming, outgoing } = partitionAssetChanges(review.assetChanges);
  const evidenceTone =
    review.status === 'failed'
      ? { background: 'bg-error/10', color: '#ff6f61' }
      : review.status === 'unavailable'
        ? { background: 'bg-surface-elevated', color: '#a1a1aa' }
        : { background: 'bg-success/10', color: '#7ad88f' };
  return (
    <View className="gap-5">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View
          accessibilityLabel={`Simulation verdict: ${meta.label}`}
          className={`flex-row items-center gap-2 rounded-full border px-3 py-1.5 ${VERDICT_CLASSES[meta.tone]}`}
        >
          {meta.tone === 'success' ? (
            <ShieldCheck size={14} color="#7ad88f" />
          ) : meta.tone === 'error' ? (
            <XCircle size={14} color="#ff6f61" />
          ) : (
            <CloudOff size={14} color="#a1a1aa" />
          )}
          <Text
            className={`font-sans-semibold text-[11px] ${VERDICT_TEXT_CLASSES[meta.tone]}`}
          >
            {meta.label}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 rounded-full border border-line px-3 py-1.5">
          <Text className="font-sans-medium text-[10.5px] text-ink">
            {simulationChainLabel(review.chainId)}
          </Text>
          <View className="h-2 w-2 rounded-full bg-usd" />
        </View>
      </View>

      <View className="rounded-2xl border border-line bg-surface px-4 py-3">
        <Text className="font-sans-semibold text-[11px] text-ink">
          Wallet · {formatAddress(review.walletAddress)}
        </Text>
        <Text className="mt-1 text-[10px] leading-4 text-ink-dim">
          Group {review.groupId} · reviewed{' '}
          {new Date(review.reviewedAt).toLocaleString()}
        </Text>
      </View>

      <BlockingBanner review={review} />

      <View>
        <SectionLabel>Net flow</SectionLabel>
        <SimulationAssetRows outgoing={outgoing} incoming={incoming} />
      </View>

      {review.approvals.length > 0 ? (
        <View>
          <SectionLabel>Approvals · read-only</SectionLabel>
          <View className="gap-3">
            {review.approvals.map((approval) => (
              <ReadOnlyApproval
                key={`${review.groupFingerprint}-${approval.callIndex}`}
                approval={approval}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <SectionLabel>Execution</SectionLabel>
        <SimulationCallList
          calls={review.calls}
          contracts={review.contracts}
          approvals={review.approvals}
        />
      </View>

      <View>
        <SectionLabel>Evidence</SectionLabel>
        <View className="overflow-hidden rounded-2xl border border-line bg-surface">
          <View className="flex-row items-start gap-3 border-b border-line px-4 py-4">
            <View
              className={`h-9 w-9 items-center justify-center rounded-xl ${evidenceTone.background}`}
            >
              {review.status === 'failed' ? (
                <XCircle size={17} color={evidenceTone.color} />
              ) : review.status === 'unavailable' ? (
                <CloudOff size={17} color={evidenceTone.color} />
              ) : (
                <ShieldCheck size={17} color={evidenceTone.color} />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-sans-semibold text-[12px] text-ink">
                {review.status === 'failed' || review.status === 'unavailable'
                  ? 'Tenderly simulation evidence'
                  : 'Independently simulated by Tenderly'}
              </Text>
              <Text className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
                {review.status === 'failed'
                  ? review.failureReason
                  : review.status === 'unavailable'
                    ? review.unavailableReason
                    : `${review.calls.length} ${review.calls.length === 1 ? 'call' : 'calls'} executed in order as one stateful bundle.`}
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
                  {review.blockNumber?.toLocaleString('en-US') ?? 'Unavailable'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
                  Call gas
                </Text>
                <Text className="mt-1 font-mono text-[10px] text-ink-dim">
                  {formatInteger(review.callGas)}
                </Text>
              </View>
            </View>
            {review.shareUrls.length > 0 ? (
              <View className="gap-2 border-t border-line pt-3">
                <Text className="font-mono-semibold text-[8px] uppercase tracking-[.6px] text-ink-faint">
                  Public simulation results
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {review.shareUrls.map((url, index) => (
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
                        Result {index + 1} · Tenderly
                      </Text>
                    </Tap>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
