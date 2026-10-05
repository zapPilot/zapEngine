import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { musicOptions, runMusic } from './lib/music-job';
import { publicDir, videoPaths, workspaceRoot } from './lib/paths';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  takes: { type: 'string', default: '2' },
  pick: { type: 'string' },
});
const id = requireVideoId(positionals, videoIds);
const options = musicOptions(values.takes, values.pick);
const { storyboard } = getVideo(id);
const manifest = parseVoManifest(
  JSON.parse(await readFile(videoPaths(id).voManifest, 'utf8')),
);
const seconds =
  buildTimeline(storyboard, manifest).durationInFrames / storyboard.fps;
console.log(
  `${id}: ${seconds.toFixed(2)}s film; takes ${options.takes}, estimate $${(options.pick === undefined ? options.takes * 0.08 : 0).toFixed(2)}; shared $1 cap (including failed calls)`,
);
console.log(
  await runMusic({
    storyboard,
    seconds,
    root: path.join(workspaceRoot, 'out'),
    publicDir,
    knownIds: videoIds,
    options,
    apiKey: process.env['OPENROUTER_API_KEY'],
  }),
);
