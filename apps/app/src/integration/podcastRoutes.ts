export function podcastEpisodeHref(
  episodeId: string,
  languageCode: string,
): string {
  const normalizedEpisodeId = episodeId.trim();
  if (normalizedEpisodeId === '') {
    return '/podcast';
  }

  const route = `/podcast/${encodeURIComponent(normalizedEpisodeId)}`;
  const normalizedLanguageCode = languageCode.trim();
  return normalizedLanguageCode === ''
    ? route
    : `${route}?lang=${encodeURIComponent(normalizedLanguageCode)}`;
}
