import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

import type { CaptionLang } from '../../src/timeline/types';

/**
 * `pnpm <script> -- <args>` forwards the literal `--`, which node's parseArgs
 * treats as "everything after is positional". Drop it so
 * `pnpm capture -- calculator-pitch --base-url …` still sees the flag.
 */
export function cliArgs<const Options extends ParseArgsOptionsConfig>(
  argv: readonly string[],
  options: Options,
) {
  return parseArgs({
    args: argv.filter((arg) => arg !== '--'),
    options,
    allowPositionals: true,
    strict: true,
  });
}

/** The single required `<video-id>` positional, with a usage error otherwise. */
export function requireVideoId(
  positionals: readonly string[],
  known: readonly string[],
): string {
  const [id, ...rest] = positionals;
  if (id === undefined || rest.length > 0 || !known.includes(id)) {
    throw new Error(
      `Expected exactly one video id: ${known.join(', ')}. Got: ${positionals.join(' ') || '(none)'}`,
    );
  }
  return id;
}

/** All versions by default; reject a language the video does not provide. */
export function selectedLangs(
  available: readonly CaptionLang[],
  requested?: string,
): readonly CaptionLang[] {
  if (requested === undefined) return available;
  const lang = available.find((value) => value === requested);
  if (lang === undefined)
    throw new Error(
      `Unknown caption language "${requested}". Available: ${available.join(', ')}`,
    );
  return [lang];
}
