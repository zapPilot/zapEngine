export type UsageCostCategory = 'llm' | 'tts' | 'translate';

export interface UsageCostUsage {
  unit: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface UsageCostLine {
  category: UsageCostCategory;
  label: string;
  provider: string;
  model: string;
  costUsd: number;
  usage?: UsageCostUsage;
}

export interface UsageCostDetails {
  totalUsd: number;
  breakdown: UsageCostLine[];
}

export function buildUsageCostDetails(
  breakdown: UsageCostLine[],
): UsageCostDetails {
  return {
    totalUsd: sumUsageCostLines(breakdown),
    breakdown,
  };
}

export function sumUsageCostLines(lines: UsageCostLine[]): number {
  return lines.reduce((sum, line) => sum + line.costUsd, 0);
}

export function nonZeroUsageCostLines(lines: UsageCostLine[]): UsageCostLine[] {
  return lines.filter((line) => line.costUsd > 0);
}

export function sortUsageCostLinesByCostDesc(
  lines: UsageCostLine[],
): UsageCostLine[] {
  return [...lines].sort((a, b) => b.costUsd - a.costUsd);
}

export function compactUsageCostLines(lines: UsageCostLine[]): UsageCostLine[] {
  const grouped = new Map<string, UsageCostLine>();

  for (const line of lines) {
    const key = costLineGroupKey(line);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...line,
        usage: line.usage ? { ...line.usage } : undefined,
      });
      continue;
    }

    existing.costUsd += line.costUsd;
    if (existing.usage && line.usage) {
      existing.usage.quantity += line.usage.quantity;
    }
  }

  return [...grouped.values()];
}

function costLineGroupKey(line: UsageCostLine): string {
  return JSON.stringify({
    category: line.category,
    label: line.label,
    provider: line.provider,
    model: line.model,
    unit: line.usage?.unit ?? null,
    unitPriceUsd: line.usage?.unitPriceUsd ?? null,
  });
}

export function presentCostBreakdown(lines: UsageCostLine[]): UsageCostLine[] {
  return sortUsageCostLinesByCostDesc(
    compactUsageCostLines(nonZeroUsageCostLines(lines)),
  );
}

export function buildLlmCostLine(
  label: string,
  generated: {
    provider: string;
    model: string;
    costUsd: number;
  },
): UsageCostLine {
  return {
    category: 'llm',
    label,
    provider: generated.provider,
    model: generated.model,
    costUsd: generated.costUsd,
  };
}

export function formatUsd(value: number): string {
  return value.toFixed(5);
}

/**
 * High-level, human-facing cost groups — "what the money was spent on" rather
 * than which model/voice produced it. Each raw {@link UsageCostLine} maps to one
 * group via {@link classifyCostGroup}.
 */
export type UsageCostGroup =
  | 'narration'
  | 'classroom'
  | 'script'
  | 'translation'
  | 'other';

const GROUP_LABELS: Record<UsageCostGroup, string> = {
  narration: '旁白語音',
  classroom: '外語小教室',
  script: '文稿撰寫',
  translation: '翻譯',
  other: '其他',
};

export function classifyCostGroup(line: UsageCostLine): UsageCostGroup {
  if (line.category === 'translate') {
    return 'translation';
  }
  if (line.label === 'LLM script') {
    return 'script';
  }
  if (line.label === 'LLM classrooms' || line.label === 'TTS classroom audio') {
    return 'classroom';
  }
  if (line.label === 'TTS main audio') {
    return 'narration';
  }
  return 'other';
}

export interface UsageCostGroupSummary {
  group: UsageCostGroup;
  label: string;
  costUsd: number;
}

/**
 * Collapses the raw breakdown into one subtotal per high-level group, dropping
 * model/voice/usage detail. Zero-cost lines and empty groups are removed, and
 * the result is sorted by cost descending.
 */
export function summarizeCostByGroup(
  lines: UsageCostLine[],
): UsageCostGroupSummary[] {
  const totals = new Map<UsageCostGroup, number>();

  for (const line of nonZeroUsageCostLines(lines)) {
    const group = classifyCostGroup(line);
    totals.set(group, (totals.get(group) ?? 0) + line.costUsd);
  }

  return [...totals.entries()]
    .map(([group, costUsd]) => ({ group, label: GROUP_LABELS[group], costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

export function formatCostGroupLine(summary: UsageCostGroupSummary): string {
  return `- ${summary.label}: $${formatUsd(summary.costUsd)}`;
}

export interface IngestSummaryInput {
  status: 200 | 201;
  title: string;
  hlsUrl?: string | null;
  costDetails: UsageCostDetails;
}

export interface IngestSummaryResult {
  statusCode: 200 | 201;
  episode: {
    title: string;
    hlsUrl?: string | null;
  };
  costDetails: UsageCostDetails;
}

export function buildIngestSummary(input: IngestSummaryInput): string {
  const status = input.status === 200 ? '✅ 已存在' : '✅ 完成';
  const lines = [status, `《${input.title}》`];
  if (input.hlsUrl) {
    lines.push(input.hlsUrl);
  }

  const costGroups = summarizeCostByGroup(input.costDetails.breakdown);
  if (input.costDetails.totalUsd > 0 && costGroups.length > 0) {
    lines.push(`💰 Total $${formatUsd(input.costDetails.totalUsd)}`);
    lines.push(...costGroups.map(formatCostGroupLine));
  }

  return lines.join('\n');
}

export function buildIngestSummaryFromResult(
  result: IngestSummaryResult,
): string {
  return buildIngestSummary({
    status: result.statusCode,
    title: result.episode.title,
    hlsUrl: result.episode.hlsUrl,
    costDetails: result.costDetails,
  });
}
