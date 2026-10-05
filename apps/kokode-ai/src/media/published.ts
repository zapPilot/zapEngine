import manifest from './published.json';
import type { Manifest } from '@zapengine/media-release';
/** The sole source of public media URLs. Missing releases stay hidden during bootstrap. */
// JSON imports widen contentType literals to string. The strict media test and
// publisher validate this file against manifestSchema before it is released.
export const published = manifest as Manifest;
export function publishedArtifact(id: string) {
  return published.artifacts[id];
}
