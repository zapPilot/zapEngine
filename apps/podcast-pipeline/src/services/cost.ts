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
