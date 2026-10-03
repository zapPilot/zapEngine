import path from 'node:path';

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
    out: path.join(workspaceRoot, 'out', videoId),
  };
}
