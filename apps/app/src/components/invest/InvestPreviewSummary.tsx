import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/ListRow';
import { SectorAllocationBar } from '@/components/invest/SectorAllocationBar';
import type { SectorWeights } from '@/integration/investSectorModel';
import { formatUsd6 } from '@/lib/format';
export function InvestPreviewSummary({
  totalUsd6,
  weights,
}: {
  totalUsd6: bigint;
  weights: SectorWeights;
}) {
  return (
    <Card className="mt-4 p-4">
      <ListRow title="Total" value={formatUsd6(totalUsd6)} />
      <SectorAllocationBar weights={weights} />
    </Card>
  );
}
