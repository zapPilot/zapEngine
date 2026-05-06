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

export function mapLatestDmaSnapshotRow(
  row: LatestDmaSnapshotRow,
): LatestDmaSnapshot {
  return {
    date:
      row.snapshot_date instanceof Date
        ? formatDateToYYYYMMDD(row.snapshot_date)
        : String(row.snapshot_date),
    price: Number.parseFloat(String(row.price_usd)),
    dma200:
      row.dma_200 === null || row.dma_200 === undefined
        ? null
        : Number.parseFloat(String(row.dma_200)),
    isAboveDma: row.is_above_dma,
  };
}
