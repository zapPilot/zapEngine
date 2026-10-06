import { manifestSchema, type Manifest } from '@zapengine/media-release';
import { artifacts, MEDIA_BASE, RENDER_COMMAND } from './artifacts';
// Escape every regex metacharacter so artifact object names match literally.
// Escaping only dots left backslashes (and +, (, ...) live in the pattern
// (CodeQL js/incomplete-sanitization).
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function validatePublished(
  value: unknown,
  expected: Record<string, string>,
): Manifest {
  try {
    const manifest = manifestSchema.parse(value);
    const keys = Object.keys(manifest.artifacts);
    if (
      keys.length !== Object.keys(artifacts).length ||
      keys.some((id) => !(id in artifacts)) ||
      manifest.release === null
    )
      throw new Error('Incomplete manifest');
    for (const [id, entry] of Object.entries(manifest.artifacts)) {
      const spec = artifacts[id];
      const url = new URL(entry.url);
      if (
        !spec ||
        url.origin !== MEDIA_BASE ||
        url.search ||
        url.hash ||
        !new RegExp(
          `^/releases/\\d{8}-\\d{6}-[a-f0-9]{8}/${escapeRegExp(spec.object)}$`,
        ).test(url.pathname) ||
        entry.contentType !== spec.contentType ||
        entry.fingerprint !== expected[id]
      )
        throw new Error(`${id}: stale fingerprint or invalid URL/type`);
    }
    return manifest;
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}. Run ${RENDER_COMMAND}`,
    );
  }
}
