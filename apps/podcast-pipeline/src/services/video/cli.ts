import { resolve } from 'node:path';

import { assertOnlyKnownFlags, parseFlagArgs } from '../../lib/cli-args.js';
import { runCli } from '../../lib/cli-runner.js';
import { isMainModule } from '../../lib/is-main-module.js';
import {
  describeRenderedVideo,
  outputDirectoryLabel,
  renderSlideVideo,
} from './renderer.js';

export interface VideoCliOptions {
  manifestPath: string;
  outputDirectory: string;
  audioSource?: string;
}

const USAGE =
  'Usage: video:render --manifest <file> --output <directory> [--audio <file-or-url>]';

export function parseVideoCliArgs(argv: string[]): VideoCliOptions {
  const parsed = parseFlagArgs(['video:render', ...argv]);
  assertOnlyKnownFlags(parsed, ['manifest', 'output', 'audio'], USAGE);

  const manifestFlag = parsed.flags['manifest'];
  const outputFlag = parsed.flags['output'];
  const audioFlag = parsed.flags['audio'];
  if (
    typeof manifestFlag === 'boolean' ||
    typeof outputFlag === 'boolean' ||
    typeof audioFlag === 'boolean'
  ) {
    throw new Error(USAGE);
  }
  if (!manifestFlag || !outputFlag) {
    throw new Error('Both --manifest and --output are required');
  }
  return {
    manifestPath: resolve(manifestFlag),
    outputDirectory: resolve(outputFlag),
    ...(audioFlag
      ? {
          audioSource: /^https?:\/\//.test(audioFlag)
            ? audioFlag
            : resolve(audioFlag),
        }
      : {}),
  };
}

export async function runVideoCli(argv: string[]): Promise<void> {
  const options = parseVideoCliArgs(argv);
  console.log(`Rendering ${outputDirectoryLabel(options.outputDirectory)}`);
  const result = await renderSlideVideo({
    ...options,
    onProgress: (event) => console.log(event.message),
  });
  console.log(describeRenderedVideo(result));
}

if (isMainModule(import.meta.url)) {
  runCli(() => runVideoCli(process.argv.slice(2)));
}
