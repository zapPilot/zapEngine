import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { ensureBrowser, selectComposition } from '@remotion/renderer';

import { publicDir, workspaceRoot } from './paths';

/** Bundles the Remotion entry once and resolves a composition's metadata. */
export async function prepare(videoId: string) {
  await ensureBrowser();
  const serveUrl = await bundle({
    entryPoint: path.join(workspaceRoot, 'src', 'index.ts'),
    publicDir,
  });
  const inputProps = { captions: true, music: true };
  const composition = await selectComposition({
    serveUrl,
    id: videoId,
    inputProps,
  });
  return { serveUrl, composition, inputProps };
}
