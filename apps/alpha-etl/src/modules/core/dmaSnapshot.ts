import { formatDateToYYYYMMDD } from '../../utils/dateUtils.js';

export interface LatestDmaSnapshot {
  date: string;
  price: number;
  dma200: number | null;
  isAboveDma: boolean | null;
}

export interface LatestDmaSnapshotRow {
  snapshot_date: Date | string;
  price_usd: string | number;
  dma_200: string | number | null | undefined;
  is_above_dma: boolean | null;
}

function formatSnapshotDate(snapshotDate: Date | string): string {
  if (snapshotDate instanceof Date) {
    return formatDateToYYYYMMDD(snapshotDate);
  }

  return String(snapshotDate);
}

function parseNullableNumber(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.parseFloat(String(value));
}

export function mapLatestDmaSnapshotRow(
  row: LatestDmaSnapshotRow,
): LatestDmaSnapshot {
  return {
    date: formatSnapshotDate(row.snapshot_date),
    price: Number.parseFloat(String(row.price_usd)),
    dma200: parseNullableNumber(row.dma_200),
    isAboveDma: row.is_above_dma,
  };
}
