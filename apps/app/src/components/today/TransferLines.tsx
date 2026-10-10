import { Text } from '@/components/ui/Text';
import { transferSleeve } from '@/integration/todayModel';
import { formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
type Bucket = Parameters<typeof transferSleeve>[0];
export function TransferLines({
  transfers,
}: {
  transfers: readonly {
    from_bucket: Bucket;
    to_bucket: Bucket;
    amount_usd: number;
  }[];
}) {
  const { t } = useContentLanguage();
  return transfers.map((transfer, index) => (
    <Text key={index} variant="caption" tone="secondary">
      {t('today.transfer', {
        from: t(`today.sleeve.${transferSleeve(transfer.from_bucket)}`),
        to: t(`today.sleeve.${transferSleeve(transfer.to_bucket)}`),
        amount: formatUsd(transfer.amount_usd),
      })}
    </Text>
  ));
}
