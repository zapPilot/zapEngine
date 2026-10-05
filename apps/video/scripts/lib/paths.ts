import path from 'node:path';

import type { CaptionLang } from '../../src/timeline/types';

/** apps/video, wherever the script is launched from. */
export const workspaceRoot = path.resolve(import.meta.dirname, '../..');

export const publicDir = path.join(workspaceRoot, 'public');

/** Every file a video reads or writes, by convention from its id. */
export function videoPaths(videoId: string) {
  const source = path.join(workspaceRoot, 'src', 'videos', videoId);
  return {
    voManifest: path.join(source, 'vo.manifest.json'),
    captureManifest: path.join(source, 'captures.json'),
    /** Relative to `public/`, i.e. what `staticFile()` receives. */
    voPublic: `vo/${videoId}`,
    capturePublic: `captures/${videoId}`,
    /** Stills, contact sheet and intermediate renders. */
    work: path.join(workspaceRoot, 'out', videoId),
    /** The deliverable. */
    videoFile: (lang: CaptionLang) =>
      path.join(workspaceRoot, 'out', `${videoId}.${lang}.mp4`),
    versionWork: (lang: CaptionLang) =>
      path.join(workspaceRoot, 'out', videoId, lang),
  };
}
