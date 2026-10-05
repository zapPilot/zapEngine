import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseVoManifest } from '../src/timeline/manifest';
import { getVideo } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { brandOptions, runBrandAudio } from './lib/brand-audio-job';
import { resolveEngine } from './lib/fish-audio';
import { publicDir, videoPaths, workspaceRoot } from './lib/paths';
import { BRAND_CLIPS, type BrandClip } from './lib/speech-plan';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  takes: { type: 'string' },
  pick: { type: 'string' },
  audition: { type: 'boolean' },
  take: { type: 'string' },
  keep: { type: 'string' },
  'pause-scale': { type: 'string' },
  replace: { type: 'boolean' },
});
const id = requireVideoId(positionals, Object.keys(BRAND_CLIPS));
const { storyboard } = getVideo('kokode-clinic');
const manifest = parseVoManifest(
  JSON.parse(await readFile(videoPaths('kokode-clinic').voManifest, 'utf8')),
);
const files = await runBrandAudio({
  id,
  clip: BRAND_CLIPS[id] as BrandClip,
  root: path.join(workspaceRoot, 'out', 'brand-audio'),
  publicDir,
  engine: resolveEngine(process.env),
  apiKey: process.env['FISH_AUDIO_API_KEY'],
  options: brandOptions(values),
  storyboard,
  baseline: Object.fromEntries(
    Object.entries(manifest.lines).map(([key, value]) => [
      key,
      path.join(publicDir, value.file),
    ]),
  ),
});
for (const file of files) console.log(file);
