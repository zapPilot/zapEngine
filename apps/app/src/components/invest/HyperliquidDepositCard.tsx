import { tokens } from '@zapengine/design-tokens/tokens';
import type { WizardHlpState } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import {
  canSubmitHlpDeposit,
  HLP_STATUS_COPY,
  hlpAmountRows,
  hyperliquidAccountUrl,
} from '@/integration/investExecutionModel';

interface HyperliquidDepositCardProps {
  hlp: WizardHlpState;
  userAddress: string | null;
  onDeposit: () => void;
}

/**
 * Final wizard step: gasless HLP vault deposit once bridged USDC lands on
 * HyperCore. The lockup acknowledgement gates the CTA because HLP deposits
 * cannot be withdrawn for `lockupDays` after entry.
 */
export function HyperliquidDepositCard({
  hlp,
  userAddress,
  onDeposit,
}: HyperliquidDepositCardProps) {
  const [lockAccepted, setLockAccepted] = useState(false);
  const rows = hlpAmountRows(hlp);
  const accountUrl = hyperliquidAccountUrl(hlp, userAddress);
  const lockupDays = hlp.step?.lockupDays;

  return (
    <Card className="p-4">
      <Text className="text-[13.5px] text-ink-dim">
        {HLP_STATUS_COPY[hlp.status]}
      </Text>

      {rows.length > 0 && (
        <View className="mt-3">
          {rows.map((row, index) => (
            <InfoRow
              key={row.label}
              label={row.label}
              value={row.value}
              divider={index < rows.length - 1}
            />
          ))}
        </View>
      )}

      {hlp.status !== 'deposited' && (
        <>
          <Tap
            accessibilityRole="checkbox"
            accessibilityState={{ checked: lockAccepted }}
            onPress={() => setLockAccepted((value) => !value)}
            className="mt-4 flex-row items-start gap-2.5"
          >
            <View
              className="mt-[1px] h-[18px] w-[18px] items-center justify-center rounded-[5px] border"
              style={{
                borderColor: lockAccepted
                  ? tokens.color.accent
                  : 'rgba(255,255,255,.25)',
                backgroundColor: lockAccepted
                  ? tokens.color.accent
                  : 'transparent',
              }}
            >
              {lockAccepted && (
                <Check size={13} strokeWidth={3} color="#0a0a0a" />
              )}
            </View>
            <Text className="flex-1 text-[12.5px] leading-[18px] text-ink-dim">
              I understand HLP deposits are locked for {lockupDays ?? 'several'}{' '}
              days after entry.
            </Text>
          </Tap>

          <PrimaryButton
            className="mt-4"
            disabled={!canSubmitHlpDeposit(hlp.status, lockAccepted)}
            onPress={onDeposit}
          >
            {hlp.status === 'confirming' ? 'Confirming…' : 'Deposit to HLP'}
          </PrimaryButton>
        </>
      )}

      {accountUrl && (
        <Tap
          className="mt-3 self-start"
          onPress={() => void Linking.openURL(accountUrl)}
        >
          <Text className="text-[12px] text-accent underline">
            View your Hyperliquid account
          </Text>
        </Tap>
      )}
    </Card>
  );
}
