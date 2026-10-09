import { View } from 'react-native';
import { ListRow } from '@/components/ui/ListRow';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { fundChecksFromReviews } from '@/integration/fundChecksModel';
import type { ReviewedBatch } from '@/integration/useInvestReview';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
const PROVIDER = 'Tenderly';
export function FundChecksList({
  batches,
  hasHyperCore,
  venue,
}: {
  batches: readonly ReviewedBatch[];
  hasHyperCore: boolean;
  venue: string;
}) {
  const { t } = useContentLanguage();
  const rows = fundChecksFromReviews(batches, hasHyperCore);
  const statusLabel = {
    checked: t('fund.passed'),
    warning: t('fund.warning'),
    failed: t('fund.failedCheck'),
    unavailable: t('fund.pendingCheck'),
    'not-simulated': t('fund.notSimulated'),
  };
  return (
    <View className="rounded-panel border border-rule bg-well px-4">
      {rows.map((row, index) => (
        <ListRow
          key={row.id}
          leading={
            <StatusGlyph
              status={row.status === 'checked' ? 'live' : 'planned'}
            />
          }
          title={
            row.id === 'simulation'
              ? t('fund.simulation', { provider: PROVIDER })
              : row.id === 'hypercore'
                ? venue
                : t(`fund.${row.id}`)
          }
          value={statusLabel[row.status]}
          subtitle={
            row.minimums?.length
              ? t('fund.minimumCount', { count: row.minimums.length })
              : undefined
          }
          divider={index < rows.length - 1}
        />
      ))}
    </View>
  );
}
