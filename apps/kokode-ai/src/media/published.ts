import manifest from './published.json';
import type { Manifest } from '@zapengine/media-release';
/** The sole source of public media URLs. Missing releases stay hidden during bootstrap. */
export const published: Manifest = manifest;
export function publishedArtifact(id: string) {
  return published.artifacts[id];
}
