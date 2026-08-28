/** Convert an underscore- or hyphen-delimited identifier into readable text. */
export function humanizeSlug(
  slug: string,
  labels: Readonly<Record<string, string>> = {},
  emptyFallback = 'No additional context.',
): string {
  const mapped = labels[slug];
  if (mapped) {
    return mapped;
  }

  const normalized = slug.replaceAll(/[_-]+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return emptyFallback;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
