export function formatUsdAmount(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function humanizeSlug(
  slug: string,
  labels: Readonly<Record<string, string>> = {},
): string {
  const mapped = labels[slug];
  if (mapped) return mapped;

  const normalized = slug.replaceAll(/[_-]+/g, ' ').trim().toLowerCase();
  if (!normalized) return 'No additional context.';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
