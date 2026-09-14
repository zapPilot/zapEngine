import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpSpendableShortfallUsd6 } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHlpSpotDepositPlan } from '@zapengine/app-core/services';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { formatUnits } from 'viem';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { StepHeader } from '@/components/invest/StepHeader';
import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import {
  belowHlpMinimum,
  hlpAccountModeLabel,
  hlpBalanceLabel,
  hlpBalanceRows,
  hlpSpendableUsd6,
  hlpStandardAccountHint,
} from '@/integration/hyperliquidPanelModel';
import {
  hlpSpotDepositCta,
  hlpSpotDone,
  hlpSpotSignatureLabel,
} from '@/integration/hlpSpotDepositModel';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
  quickAmountUsdInput,
} from '@/integration/investAmountModel';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { useHyperCoreSpendable } from '@/integration/useHlpBalances';
import { useInvest } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

function usd(value: bigint | undefined | null): string {
  return value === undefined || value === null
    ? '—'
    : formatUsd(Number(formatUnits(value, 6)));
}

/**
 * Size a deposit funded by USDC already on Hyperliquid. There is no bridge and
 * no EVM transaction, so this never enters the reviewed-batch queue.
 */
function HlpSpotAmountStep() {
  const account = useAccount();
  const invest = useInvest();
  const [amountInput, setAmountInput] = useState('');
  const amountUsd = amountUsdFromInput(amountInput);
  const fromAmount = amountInputToUsd6(amountInput);

  const hyperCore = useHyperCoreSpendable(account.address);
  const balance = hyperCore.balance;
  const availableUsd6 = account.isConnected ? hlpSpendableUsd6(balance) : null;
  const availableLabel = hyperCore.isLoading
    ? 'Loading balance…'
    : availableUsd6 === null
      ? 'Available —'
      : `Available ${usd(availableUsd6)}`;

  const belowMinimum = belowHlpMinimum(fromAmount);
  const hasAmount = amountUsd !== null && fromAmount !== '0';
  const exceedsBalance =
    availableUsd6 !== null && hasAmount && BigInt(fromAmount) > availableUsd6;
  const balanceUnavailable =
    account.isConnected &&
    (hyperCore.isLoading || hyperCore.isError || availableUsd6 === null);
  const standardHint = hlpStandardAccountHint(balance);

  const armDeposit = () => {
    if (!account.isConnected) {
      requestAccountConnection(account);
      return;
    }
    if (!hasAmount || belowMinimum || exceedsBalance || balanceUnavailable) {
      return;
    }
    invest.setHyperCoreFundingDraft({
      source: 'hypercore-spot',
      requestedUsd6: fromAmount,
    });
  };

  return (
    <ScreenScrollView>
      <StepHeader step="HLP" title="Deposit from Hyperliquid" />
      <View className="px-5 pt-4">
        <Card className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
              Hyperliquid USDC amount
            </Text>
            <Text className="font-mono text-[10.5px] text-ink-dim">
              {availableLabel}
            </Text>
          </View>
          <View className="mt-2 flex-row items-center">
            <Text className="mr-2 font-sans-semibold text-[28px] text-ink-dim">
              $
            </Text>
            <TextInput
              accessibilityLabel="Hyperliquid deposit amount in US dollars"
              className="min-w-0 flex-1 font-sans-semibold text-[40px] leading-[46px] text-ink"
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#52525b"
              value={amountInput}
              onChangeText={(value) =>
                setAmountInput(normalizeAmountInput(value))
              }
            />
            <TokenSelectorPill
              symbol="USDC"
              chainKey="hyperliquid"
              accessibilityLabel="Funding asset: USDC on Hyperliquid"
            />
          </View>
          {balance ? (
            <Text className="mt-1 font-mono text-[11px] text-ink-dim">
              Account mode · {hlpAccountModeLabel(balance.mode)}
            </Text>
          ) : null}
          <QuickAmountChips
            disabled={
              !account.isConnected ||
              availableUsd6 === null ||
              availableUsd6 <= 0n
            }
            maxAccessibilityLabel="Use the full Hyperliquid balance"
            onSelect={(bps) =>
              setAmountInput(
                quickAmountUsdInput(
                  availableUsd6 === null
                    ? null
                    : Number(formatUnits(availableUsd6, 6)),
                  bps,
                ),
              )
            }
          />
        </Card>

        <Card className="mt-3 p-4">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
            On Hyperliquid
          </Text>
          <View className="mt-2">
            {balance ? (
              <>
                <InfoRow
                  label="Account mode"
                  value={hlpAccountModeLabel(balance.mode)}
                  divider
                />
                {hlpBalanceRows(balance).map((row, index, rows) => (
                  <InfoRow
                    key={row.label}
                    label={row.label}
                    value={hlpBalanceLabel({
                      isConnected: account.isConnected,
                      isLoading: hyperCore.isLoading,
                      isError: hyperCore.isError,
                      value: row.value,
                    })}
                    divider={index < rows.length - 1}
                  />
                ))}
              </>
            ) : (
              <InfoRow
                label="Account mode"
                value={hyperCore.isLoading ? 'Loading…' : '—'}
              />
            )}
          </View>
        </Card>

        <Card className="mt-3 p-4">
          <InfoRow label="Destination" value="Official HLP vault" divider />
          <InfoRow label="Minimum deposit" value="10 USDC" divider />
          <InfoRow label="Withdrawal lock" value="4 days" divider />
          <InfoRow label="Network fee" value="None — no gas" />
        </Card>

        {standardHint ? (
          <Text className="mt-2.5 px-1 text-[11px] leading-4 text-ink-dim">
            {standardHint}
          </Text>
        ) : null}
        {belowMinimum ? (
          <Text className="mt-2.5 px-1 text-[11px] text-error">
            Enter at least $10. The HLP vault rejects smaller deposits.
          </Text>
        ) : null}
        {exceedsBalance ? (
          <Text className="mt-2.5 px-1 text-[11px] text-error">
            This amount exceeds your spendable Hyperliquid balance.
          </Text>
        ) : null}
        {hyperCore.isError ? (
          <Text className="mt-2.5 px-1 text-[11px] leading-4 text-error">
            Your Hyperliquid balance is unavailable right now, so the deposit
            cannot be sized. Retry in a moment.
          </Text>
        ) : null}

        <PrimaryButton
          className="mt-5"
          disabled={
            account.isConnected &&
            (!hasAmount || belowMinimum || exceedsBalance || balanceUnavailable)
          }
          onPress={armDeposit}
        >
          {account.isConnected ? 'Review HLP deposit' : CONNECT_WALLET_CTA}
        </PrimaryButton>
        <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
          Zap Pilot deposits with a Hyperliquid signing key you approve once.
          The key can act inside your Hyperliquid account but can never withdraw
          or send funds to anyone else.
        </Text>
      </View>
    </ScreenScrollView>
  );
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
    return <HlpSpotAmountStep />;
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
          onPress={() => invest.setHyperCoreFundingDraft(null)}
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
