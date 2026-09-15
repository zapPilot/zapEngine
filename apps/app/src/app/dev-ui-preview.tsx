import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FundingPlanDisclosure } from '@/components/invest/FundingPlanDisclosure';
import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { InvestPreviewSummary } from '@/components/invest/InvestPreviewSummary';
import {
  DEFAULT_SECTOR_WEIGHTS,
  resolveTargetAllocations,
} from '@/integration/investSectorModel';
import {
  planFunding,
  type FundingOverrides,
} from '@/integration/investFundingPlanner';
import { reviewedInvestFixture } from '../../tests/support/investReviewFixture';
const rows = [8453, 42161].flatMap((chainId) =>
  ['USDC', 'ETH'].map((symbol) => ({
    id: `${chainId}:${symbol}`,
    chain: chainId === 8453 ? ('base' as const) : ('arbitrum' as const),
    chainLabel: 'Chain',
    chainId,
    tokenAddress: null,
    decimals: symbol === 'ETH' ? 18 : 6,
    balance: symbol === 'ETH' ? '0.1' : '100',
    balanceBaseUnits: symbol === 'ETH' ? '100000000000000000' : '100000000',
    usdValue: symbol === 'ETH' ? 200 : 100,
    usdPrice: symbol === 'ETH' ? 2000 : 1,
    token: { symbol: symbol as 'ETH' | 'USDC', name: symbol },
  })),
);
export default function Preview() {
  const [overrides, setOverrides] = useState<FundingOverrides>({});
  const plan = planFunding({
    demand: {
      totalUsd6: '100000000',
      allocations: resolveTargetAllocations(DEFAULT_SECTOR_WEIGHTS),
    },
    supply: { rows, unavailableChainIds: [] },
    constraints: { overrides, gasReserveUsd: 5 },
  });
  return (
    <ScrollView style={{ flex: 1 }}>
      <View
        style={{
          padding: 20,
          maxWidth: 480,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Text style={{ color: 'white' }}>Investment fixture gallery</Text>
        <FundingPlanDisclosure
          plan={plan}
          hasAmount
          isConnected
          hasOverrides={Object.keys(overrides).length > 0}
          onChangeSource={(id, token) =>
            setOverrides({ ...overrides, [id]: token })
          }
          onUseRecommended={() => setOverrides({})}
          onOpenHlpSpotDeposit={() => {}}
        />
        <InvestPreviewSummary
          totalUsd6={100000000n}
          weights={DEFAULT_SECTOR_WEIGHTS}
        />
        <ChainBatchReviewCard
          batch={reviewedInvestFixture}
          stepLabel="Step 1 of 2"
        />
      </View>
    </ScrollView>
  );
}
