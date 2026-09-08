/** Escapes a filesystem path for embedding inside an ffmpeg filtergraph argument (e.g. `ass=filename='...'`). */
export function escapeFilterPath(path: string): string {
  return path
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'");
}
