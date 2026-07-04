import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import {
  amountUsdFromInput,
  depositSupportLabel,
  normalizeAmountInput,
} from '@/integration/investAmountModel';
import { DEFAULT_DEPOSIT_TOKEN } from '@/integration/depositTokens';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
import { formatUsd } from '@/lib/format';

export function InvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useInvestableBalances(
    account.walletAddresses[0] ?? account.address,
  );
  const [amountInput, setAmountInput] = useState(
    invest.amountUsd > 0 ? String(invest.amountUsd) : '',
  );
  const amountUsd = amountUsdFromInput(amountInput, 'USD', 1);

  return (
    <ScreenScrollView>
      <StepHeader title="Invest" step="Step 1 of 3" />
      <StepProgress current={1} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Choose amount
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          {depositSupportLabel()}
        </Text>
        <Card className="mt-5 p-4">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
            Amount
          </Text>
          <TextInput
            className="mt-2 font-serif text-[48px] leading-[54px] text-ink"
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#52525b"
            value={amountInput}
            onChangeText={(value) =>
              setAmountInput(normalizeAmountInput(value))
            }
          />
          <View className="mt-3 flex-row items-center gap-2">
            <TokenIcon
              glyph={DEFAULT_DEPOSIT_TOKEN.glyph}
              bg={DEFAULT_DEPOSIT_TOKEN.iconBg}
              size={24}
              alt={DEFAULT_DEPOSIT_TOKEN.symbol}
            />
            <Text className="font-sans-semibold text-[13px] text-ink">
              {DEFAULT_DEPOSIT_TOKEN.symbol}
            </Text>
            <Text className="text-[12px] text-ink-dim">
              {balances.totalUsdValue === null
                ? 'Balance pending'
                : `${formatUsd(balances.totalUsdValue)} available`}
            </Text>
          </View>
        </Card>
        <PrimaryButton
          className="mt-5"
          disabled={amountUsd === null}
          onPress={() => {
            invest.setAmountUsd(amountUsd ?? 0);
            invest.setSelectedToken(DEFAULT_DEPOSIT_TOKEN);
            router.push('/invest/route');
          }}
        >
          Continue
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
