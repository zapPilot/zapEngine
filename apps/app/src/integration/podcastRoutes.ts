export function podcastEpisodeHref(
  episodeId: string,
  languageCode: string,
  view?: 'video' | 'transcript' | 'classroom',
): string {
  const normalizedEpisodeId = episodeId.trim();
  if (normalizedEpisodeId === '') {
    return '/listen';
  }

  const route = `/podcast/${encodeURIComponent(normalizedEpisodeId)}`;
  const normalizedLanguageCode = languageCode.trim();
  const query: string[] = [];
  if (normalizedLanguageCode !== '')
    query.push(`lang=${encodeURIComponent(normalizedLanguageCode)}`);
  if (view !== undefined) query.push(`view=${view}`);
  return query.length === 0 ? route : `${route}?${query.join('&')}`;
}
