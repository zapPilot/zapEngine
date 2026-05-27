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

export function formatUsage(usage: UsageCostUsage): string {
  let unitLabel = usage.unit;
  if (usage.unit === 'utf8_bytes') {
    unitLabel = 'UTF-8 bytes';
  } else if (usage.unit === 'characters') {
    unitLabel = 'chars';
  }
  return `${usage.quantity} ${unitLabel} @ $${formatUsd(
    usage.unitPriceUsd * 1_000_000,
  )}/M`;
}

export function formatCostLine(line: UsageCostLine): string {
  const usage = line.usage ? `, ${formatUsage(line.usage)}` : '';
  return `- ${line.label} (${line.provider}/${line.model}${usage}): $${formatUsd(
    line.costUsd,
  )}`;
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

  const costLines = presentCostBreakdown(input.costDetails.breakdown);
  if (input.costDetails.totalUsd > 0 && costLines.length > 0) {
    lines.push(`💰 Total $${formatUsd(input.costDetails.totalUsd)}`);
    lines.push('Breakdown');
    lines.push(...costLines.map(formatCostLine));
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
