import path from 'node:path';

import { musicLibrary } from '../src/music/library';
import { cliArgs, requireVideoId } from './lib/args';
import { musicOptions, runMusic } from './lib/music-job';
import { workspaceRoot } from './lib/paths';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  takes: { type: 'string', default: '2' },
});
const id = requireVideoId(
  positionals,
  Object.keys(musicLibrary),
) as keyof typeof musicLibrary;
const options = musicOptions(values.takes);
console.log(
  `${id}: ${options.takes} source takes, estimate $${(options.takes * 0.08).toFixed(2)}; shared $1 cap including failures`,
);
console.log(
  await runMusic({
    id,
    prompt: musicLibrary[id].source.prompt,
    root: path.join(workspaceRoot, 'out'),
    options,
    apiKey: process.env['OPENROUTER_API_KEY'],
  }),
);
