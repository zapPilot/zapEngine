import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpSpendableShortfallUsd6 } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHlpSpotDepositPlan } from '@zapengine/app-core/services';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { StepHeader } from '@/components/invest/StepHeader';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import {
  hlpAccountModeLabel,
  hlpSpendableUsd6,
} from '@/integration/hyperliquidPanelModel';
import {
  hlpSpotDepositCta,
  hlpSpotDone,
  hlpSpotSignatureLabel,
} from '@/integration/hlpSpotDepositModel';
import { useAccount } from '@/integration/useAccount';
import { useHyperCoreSpendable } from '@/integration/useHlpBalances';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

function usd(value: bigint | undefined | null): string {
  return value === undefined || value === null
    ? '—'
    : formatUsd(Number(formatUnits(value, 6)));
}

/** Review and execute a gasless agent-signed HLP vault deposit. */
export function HlpSpotDepositScreen() {
  const router = useRouter();
  const invest = useInvest();
  const account = useAccount();
  const hyperCore = useHyperCoreSpendable(account.address);
  const [acknowledged, setAcknowledged] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const armedForRef = useRef<string | null>(null);

  const draft = invest.hyperCoreFundingDraft;
  const requestedUsd6 = draft ? BigInt(draft.requestedUsd6) : null;
  const plan = useQuery({
    queryKey: ['hlp', 'spot-plan', account.address, draft?.requestedUsd6],
    enabled: Boolean(draft && account.address),
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      getHlpSpotDepositPlan({
        kind: 'hlp-spot-deposit',
        userAddress: account.address as `0x${string}`,
        amountUsd6: draft!.requestedUsd6,
      }),
  });

  const agent = useHyperliquidAgent(plan.data?.step.signing ?? null);
  const { wizard, startSpotDeposit, runHlpDeposit, reset } = useDepositWizard({
    hyperliquidAgent: agent,
  });

  useEffect(() => {
    if (!plan.data || !draft) return;
    if (armedForRef.current === draft.requestedUsd6) return;
    armedForRef.current = draft.requestedUsd6;
    void startSpotDeposit(plan.data).catch((error: unknown) => {
      setFlowError(extractErrorMessage(error));
    });
  }, [draft, plan.data, startSpotDeposit]);

  if (!draft) {
    return (
      <ScreenScrollView>
        <StepHeader step="HLP" title="Nothing to deposit" />
        <PrimaryButton
          className="mt-5"
          onPress={() => router.replace('/invest/amount')}
        >
          Back to amount
        </PrimaryButton>
      </ScreenScrollView>
    );
  }

  const status = wizard.hlp.status;
  const liveSpendableUsd6 = hlpSpendableUsd6(hyperCore.balance);
  const shortfallUsd6 =
    requestedUsd6 === null || liveSpendableUsd6 === null
      ? null
      : hlpSpendableShortfallUsd6(requestedUsd6, liveSpendableUsd6);
  const done = hlpSpotDone(status);
  const wizardBusy = status === 'awaitingArrival' || status === 'confirming';
  const agentBusy = agent.status === 'checking' || agent.status === 'approving';
  const liveShortfall = shortfallUsd6 !== null && shortfallUsd6 > 0n;
  const cta = hlpSpotDepositCta({
    planLoading: plan.isLoading,
    wizardStatus: status,
    agentStatus: agent.status,
  });

  const runGuarded = (action: () => Promise<void>) => () => {
    setFlowError(null);
    void action().catch((error: unknown) => {
      setFlowError(extractErrorMessage(error));
    });
  };

  return (
    <ScreenScrollView>
      <StepHeader step="HLP · Review" title="Review HLP deposit" />

      <Card className="mt-4 p-4">
        <InfoRow label="Deposit" value={usd(requestedUsd6)} divider />
        <InfoRow
          label="Available on Hyperliquid"
          value={usd(liveSpendableUsd6)}
          divider
        />
        <InfoRow
          label="Account mode"
          value={
            hyperCore.balance
              ? hlpAccountModeLabel(hyperCore.balance.mode)
              : '—'
          }
        />
      </Card>

      <Card className="mt-3 p-4">
        <InfoRow
          label="Route"
          value="Hyperliquid balance → HLP vault"
          divider
        />
        <InfoRow label="Destination" value="Official HLP vault" divider />
        <InfoRow label="Network fee" value="None — no gas" divider />
        <InfoRow
          label="Signatures"
          value={hlpSpotSignatureLabel(agent.status)}
        />
      </Card>

      {!done && agent.isReady ? (
        <Tap
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel="Acknowledge the four day withdrawal lock"
          className="mt-3 flex-row items-start gap-3 rounded-xl border border-line p-3"
          onPress={() => setAcknowledged((value) => !value)}
        >
          <View
            className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
              acknowledged ? 'border-accent bg-accent' : 'border-line'
            }`}
          />
          <Text className="flex-1 text-[11.5px] leading-4 text-ink-dim">
            I understand HLP locks withdrawals for 4 days after each deposit.
          </Text>
        </Tap>
      ) : null}

      {plan.isError ? (
        <InlineErrorCard
          className="mt-3"
          body="The deposit plan could not be prepared. Go back and try again."
        />
      ) : null}
      {wizard.error ? (
        <InlineErrorCard className="mt-3" body={wizard.error.message} />
      ) : null}
      {agent.error ? (
        <InlineErrorCard className="mt-3" body={agent.error} />
      ) : null}
      {liveShortfall && !wizard.error ? (
        <InlineErrorCard
          className="mt-3"
          body={`Your spendable Hyperliquid balance is now ${usd(liveSpendableUsd6)}. Go back and lower the deposit amount.`}
        />
      ) : null}
      {flowError ? <InlineErrorCard className="mt-3" body={flowError} /> : null}

      {done ? (
        <>
          <Text className="mt-4 text-[12px] text-ink">
            {status === 'deposited'
              ? 'Deposited into HLP.'
              : 'Deposit submitted — awaiting confirmation from Hyperliquid.'}
          </Text>
          <PrimaryButton
            className="mt-5"
            onPress={() => {
              reset();
              invest.setHyperCoreFundingDraft(null);
              router.replace('/invest');
            }}
          >
            Done
          </PrimaryButton>
        </>
      ) : wizard.error || liveShortfall ? (
        <PrimaryButton
          className="mt-5"
          onPress={() => router.replace('/invest/amount')}
        >
          Back to amount
        </PrimaryButton>
      ) : (
        <PrimaryButton
          className="mt-5"
          disabled={
            plan.isLoading ||
            plan.isError ||
            wizardBusy ||
            agentBusy ||
            (agent.isReady && !acknowledged)
          }
          onPress={runGuarded(
            agent.isReady ? runHlpDeposit : () => agent.approve(),
          )}
        >
          {cta}
        </PrimaryButton>
      )}

      <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
        Enabling signing is a one-time wallet signature that approves a Zap
        Pilot agent named ZapPilot on Hyperliquid. The vault deposit itself is
        signed by that agent and cannot be undone for 4 days.
      </Text>
    </ScreenScrollView>
  );
}
