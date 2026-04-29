import { z } from 'zod';

export const CNN_FEAR_GREED_SOURCE = 'cnn_fear_greed_unofficial';

export const MACRO_FEAR_GREED_LABELS = [
  'extreme_fear',
  'fear',
  'neutral',
  'greed',
  'extreme_greed',
] as const;

export type MacroFearGreedLabel = (typeof MACRO_FEAR_GREED_LABELS)[number];

export interface CnnFearGreedPayload {
  fear_and_greed?: Record<string, unknown> | null;
  fear_and_greed_historical?: {
    data?: CnnFearGreedHistoricalPoint[] | null;
  } | null;
  [key: string]: unknown;
}

export interface CnnFearGreedHistoricalPoint {
  x?: number | string | null;
  y?: number | string | null;
  rating?: string | null;
  [key: string]: unknown;
}

export interface MacroFearGreedData {
  score: number;
  label: MacroFearGreedLabel;
  source: string;
  updatedAt: string;
  rawRating: string | null;
  rawData: Record<string, unknown>;
}

const MacroFearGreedDataSchema = z.object({
  score: z.number().min(0).max(100),
  label: z.enum(MACRO_FEAR_GREED_LABELS),
  source: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  rawRating: z.string().nullable(),
  rawData: z.record(z.string(), z.unknown()),
});

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function labelFromScore(score: number): MacroFearGreedLabel {
  const value = clampScore(score);
  if (value <= 24) return 'extreme_fear';
  if (value <= 44) return 'fear';
  if (value <= 55) return 'neutral';
  if (value <= 75) return 'greed';
  return 'extreme_greed';
}

export function normalizeMacroFearGreedLabel(
  rawRating: string | null | undefined,
  score: number,
): MacroFearGreedLabel {
  if (!rawRating) {
    return labelFromScore(score);
  }
  const normalized = rawRating
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return MACRO_FEAR_GREED_LABELS.includes(normalized as MacroFearGreedLabel)
    ? (normalized as MacroFearGreedLabel)
    : labelFromScore(score);
}

export function msToIso(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return new Date().toISOString();
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric).toISOString();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : new Date().toISOString();
}

function coerceScore(rawScore: unknown): number | null {
  if (rawScore === null || rawScore === undefined) {
    return null;
  }
  const numeric = Number(rawScore);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return clampScore(numeric);
}

function parseCurrentObject(
  payload: CnnFearGreedPayload,
): { score: number; rawRating: string | null; updatedAt: string } | null {
  const current = payload.fear_and_greed;
  if (!current || typeof current !== 'object') {
    return null;
  }
  const score = coerceScore(current['score']);
  if (score === null) {
    return null;
  }
  const rawRating =
    typeof current['rating'] === 'string' ? current['rating'] : null;
  const timestamp = current['timestamp'];
  const updatedAt =
    typeof timestamp === 'number' || typeof timestamp === 'string'
      ? msToIso(timestamp)
      : new Date().toISOString();
  return { score, rawRating, updatedAt };
}

function parseHistoricalFallback(payload: CnnFearGreedPayload): {
  score: number;
  rawRating: string | null;
  updatedAt: string;
} {
  const rows = payload.fear_and_greed_historical?.data ?? [];
  const validRows = rows
    .map((row) => ({
      row,
      timestamp: Number(row.x),
      score: coerceScore(row.y),
    }))
    .filter(
      (
        item,
      ): item is {
        row: CnnFearGreedHistoricalPoint;
        timestamp: number;
        score: number;
      } => Number.isFinite(item.timestamp) && item.score !== null,
    );
  if (validRows.length === 0) {
    throw new Error('CNN FGI payload missing score and historical data');
  }
  validRows.sort((a, b) => b.timestamp - a.timestamp);
  const latest = validRows[0]!;
  return {
    score: latest.score,
    rawRating: latest.row.rating ?? null,
    updatedAt: msToIso(latest.timestamp),
  };
}

export function parseCurrentCnnFearGreed(
  payload: CnnFearGreedPayload,
): MacroFearGreedData {
  const parsed =
    parseCurrentObject(payload) ?? parseHistoricalFallback(payload);
  const result = {
    score: parsed.score,
    label: normalizeMacroFearGreedLabel(parsed.rawRating, parsed.score),
    source: CNN_FEAR_GREED_SOURCE,
    updatedAt: parsed.updatedAt,
    rawRating: parsed.rawRating,
    rawData: payload,
  };
  return MacroFearGreedDataSchema.parse(result);
}

export function parseCnnFearGreedHistory(
  payload: CnnFearGreedPayload,
): MacroFearGreedData[] {
  const rows = payload.fear_and_greed_historical?.data ?? [];
  const deduped = new Map<string, MacroFearGreedData>();
  for (const row of rows) {
    const score = coerceScore(row.y);
    const timestamp = Number(row.x);
    if (score === null || !Number.isFinite(timestamp)) {
      continue;
    }
    const updatedAt = msToIso(timestamp);
    const data = MacroFearGreedDataSchema.parse({
      score,
      label: normalizeMacroFearGreedLabel(row.rating, score),
      source: CNN_FEAR_GREED_SOURCE,
      updatedAt,
      rawRating: row.rating ?? null,
      rawData: { original_data: row },
    });
    deduped.set(updatedAt.slice(0, 10), data);
  }
  return [...deduped.values()].sort((a, b) =>
    a.updatedAt.localeCompare(b.updatedAt),
  );
}
