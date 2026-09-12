import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { spotFundingShortfallUsd6 } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
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
import { useAccount } from '@/integration/useAccount';
import {
  useHlpPerpBalance,
  useHlpSpotBalance,
} from '@/integration/useHlpBalances';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

function usd(value: bigint | undefined): string {
  return value === undefined ? '—' : formatUsd(Number(formatUnits(value, 6)));
}

/**
 * Review and sign a HyperCore-funded HLP deposit. This is deliberately not the
 * shared `/invest/route` screen: that flow reviews an EVM batch through
 * Tenderly, and this one has no transactions to simulate, no gas to quote and
 * no source chain — only two wallet signatures.
 */
export function HlpSpotDepositScreen() {
  const router = useRouter();
  const invest = useInvest();
  const account = useAccount();
  const spot = useHlpSpotBalance(account.address);
  const perp = useHlpPerpBalance(account.address);
  const { wizard, startSpotDeposit, runSpotFunding, runHlpDeposit, reset } =
    useDepositWizard();
  const [acknowledged, setAcknowledged] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const armedForRef = useRef<string | null>(null);

  const draft = invest.hyperCoreFundingDraft;
  const requestedUsd6 = draft ? BigInt(draft.requestedUsd6) : null;

  const plan = useQuery({
    queryKey: ['hlp', 'spot-plan', account.address, draft?.requestedUsd6],
    enabled: Boolean(draft && account.address),
    // A plan with no quote and no gas cannot go stale on its own; refetching
    // would only churn the wizard that is already armed against it.
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      getHlpSpotDepositPlan({
        kind: 'hlp-spot-deposit',
        userAddress: account.address as `0x${string}`,
        amountUsd6: draft!.requestedUsd6,
      }),
  });

  useEffect(() => {
    if (!plan.data || !draft) return;
    // Arm once per frozen amount: re-arming would reset a half-finished
    // signature pair back to its first step.
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
  const shortfallUsd6 =
    requestedUsd6 === null || perp.balance === undefined
      ? null
      : spotFundingShortfallUsd6(requestedUsd6, perp.balance.withdrawableUsd6);
  const done = status === 'deposited' || status === 'submittedUnverified';
  const busy =
    status === 'funding' ||
    status === 'awaitingArrival' ||
    status === 'confirming';

  const run = (action: () => Promise<void>) => () => {
    setFlowError(null);
    void action().catch((error: unknown) => {
      setFlowError(extractErrorMessage(error));
    });
  };

  const ctaLabel = (): string => {
    if (plan.isLoading) return 'Preparing deposit…';
    if (status === 'funding') return 'Confirm in your wallet…';
    if (status === 'awaitingArrival') return 'Waiting for perp credit…';
    if (status === 'confirming') return 'Confirming deposit…';
    if (status === 'fundingRequired') {
      return `Move ${usd(shortfallUsd6 ?? undefined)} into perp`;
    }
    return 'Deposit into HLP vault';
  };

  return (
    <ScreenScrollView>
      <StepHeader step="HLP · Step 2 of 2" title="Review HLP deposit" />

      <Card className="mt-4 p-4">
        <InfoRow
          label="Deposit"
          value={usd(requestedUsd6 ?? undefined)}
          divider
        />
        <InfoRow
          label="Spot USDC"
          value={usd(spot.balance?.totalUsd6)}
          divider
        />
        <InfoRow
          label="Perp USDC"
          value={usd(perp.balance?.withdrawableUsd6)}
          divider
        />
        <InfoRow
          label="To move from spot"
          value={shortfallUsd6 === null ? '—' : usd(shortfallUsd6)}
        />
      </Card>

      <Card className="mt-3 p-4">
        <InfoRow label="Route" value="Spot → Perp → HLP vault" divider />
        <InfoRow label="Destination" value="Official HLP vault" divider />
        <InfoRow label="Network fee" value="None — signatures only" divider />
        <InfoRow label="Signatures" value={shortfallUsd6 === 0n ? '1' : '2'} />
      </Card>

      {done ? null : (
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
            This is the only step here that cannot be undone.
          </Text>
        </Tap>
      )}

      {plan.isError ? (
        <InlineErrorCard
          className="mt-3"
          body="The deposit plan could not be prepared. Go back and try again."
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
      ) : (
        <PrimaryButton
          className="mt-5"
          disabled={plan.isLoading || plan.isError || busy || !acknowledged}
          onPress={run(
            status === 'fundingRequired' ? runSpotFunding : runHlpDeposit,
          )}
        >
          {ctaLabel()}
        </PrimaryButton>
      )}

      <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
        Both actions are gasless Hyperliquid signatures. Moving USDC between
        spot and perp is reversible; the vault deposit is not.
      </Text>
    </ScreenScrollView>
  );
}
