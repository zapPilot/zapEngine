import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

// jscpd:ignore-start — parallel CLI arg parser to smoke-cli.ts; same --flag value pattern
export function parseVideoCliArgs(argv: string[]): VideoCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(
        'Usage: video:render --manifest <file> --output <directory> [--audio <file-or-url>]',
      );
    }
    if (!['--manifest', '--output', '--audio'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`);
    }
    values.set(flag, value);
  }
  // jscpd:ignore-end

  const manifestPath = values.get('--manifest');
  const outputDirectory = values.get('--output');
  if (!manifestPath || !outputDirectory) {
    throw new Error('Both --manifest and --output are required');
  }
  const audioSource = values.get('--audio');
  return {
    manifestPath: resolve(manifestPath),
    outputDirectory: resolve(outputDirectory),
    ...(audioSource
      ? {
          audioSource: /^https?:\/\//.test(audioSource)
            ? audioSource
            : resolve(audioSource),
        }
      : {}),
  };
}

export async function runVideoCli(argv: string[]): Promise<void> {
  const options = parseVideoCliArgs(argv);
  console.log(`Rendering ${outputDirectoryLabel(options.outputDirectory)}`);
  const result = await renderSlideVideo({
    ...options,
    onProgress: (message) => console.log(message),
  });
  console.log(describeRenderedVideo(result));
}

// jscpd:ignore-start — CLI direct-invocation check, same pattern as smoke-cli.ts
const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runVideoCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}
// jscpd:ignore-end
