import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROMPT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/social',
);

function readPrompt(filename: string): string {
  return readFileSync(resolve(PROMPT_ROOT, filename), 'utf8');
}

describe('social title identity prompt contract', () => {
  it('keeps material named subjects in Rednote titles', () => {
    const prompt = readPrompt('rednote.md');

    expect(prompt).toContain('Title identity is load-bearing.');
    expect(prompt).toContain(
      'keep that material entity in the Rednote title',
    );
    expect(prompt).toContain(
      'do not turn a named subject such as Fomo or Vector into a generic label',
    );
  });

  it('keeps material named subjects in YouTube titles', () => {
    const prompt = readPrompt('youtube.md');

    expect(prompt).toContain(
      'preserve that named subject in the YouTube title',
    );
    expect(prompt).toContain(
      'instead of abstracting Fomo, Vector, or another material entity into a generic competitor, platform, or company',
    );
  });
});
