/** Convert an underscore- or hyphen-delimited identifier into readable text. */
export function humanizeSlug(
  slug: string,
  labels: Readonly<Record<string, string>> = {},
  emptyFallback = 'No additional context.',
): string {
  // Own-property check: slugs come from analytics-engine as an unconstrained
  // string, so a plain `labels[slug]` would return Object.prototype members
  // (`constructor`, `toString`, …) for slugs that happen to share their name.
  if (Object.hasOwn(labels, slug) && labels[slug]) {
    return labels[slug];
  }

  const normalized = slug.replaceAll(/[_-]+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return emptyFallback;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
