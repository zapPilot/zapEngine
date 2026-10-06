import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { ensureBrowser, selectComposition } from '@remotion/renderer';

import type { CaptionLang } from '../../src/timeline/types';
import { defaultVideoProps } from '../../src/videos/metadata';
import { prepareMusic } from '../prepare-music';
import { publicDir, workspaceRoot } from './paths';

/** Bundles the Remotion entry once and resolves a composition's metadata. */
export async function prepare(
  videoId: string,
  lang: CaptionLang,
  existingServeUrl?: string,
) {
  if (existingServeUrl === undefined) await prepareMusic(videoId);
  await ensureBrowser();
  const serveUrl =
    existingServeUrl ??
    (await bundle({
      entryPoint: path.join(workspaceRoot, 'src', 'index.ts'),
      publicDir,
    }));
  const inputProps = { ...defaultVideoProps, lang };
  const composition = await selectComposition({
    serveUrl,
    id: videoId,
    inputProps,
  });
  return { serveUrl, composition, inputProps };
}
