export function itemMatches(
  title: string,
  episodeId: string | undefined,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) {
    return true;
  }
  if (title.toLocaleLowerCase().includes(query)) {
    return true;
  }
  return Boolean(episodeId?.toLocaleLowerCase().includes(query));
}
