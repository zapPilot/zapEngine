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

/**
 * Title identity used to be asserted against `rednote.md` and `youtube.md`
 * separately, which is what let the two drift apart and contradict
 * `editorial.md`. The rule now lives once in the canonical headline policy
 * (`.agents/skills/social-headline/HEADLINE.md`, copied here by
 * `pnpm lint headline-policy`), so this asserts it there and only checks that
 * the platform files still defer to it rather than restating it.
 */
describe('social title identity prompt contract', () => {
  it('keeps the story subject and drops the quoted source', () => {
    const prompt = readPrompt('headline.md');

    expect(prompt).toContain('**Keep the subject.**');
    expect(prompt).toContain('**Drop the source.**');
    expect(prompt).toContain('that the story is *about* stays in the title');
    expect(prompt).toContain(
      'If both are present, the subject wins the space.',
    );
  });

  it('treats the publisher headline as evidence rather than a template', () => {
    const prompt = readPrompt('headline.md');

    expect(prompt).toContain('**Keep the named subjects it identifies.**');
    expect(prompt).toContain('**Rewrite the sentence.**');
    expect(prompt).toContain('**Never produce it with words swapped.**');
  });

  it('requires a concrete anchor in every title', () => {
    const prompt = readPrompt('headline.md');

    expect(prompt).toContain(
      'Every title carries at least one of: a proper noun, or a number that matters.',
    );
  });

  it('leaves the platform files carrying format rules only', () => {
    const rednote = readPrompt('rednote.md');
    const youtube = readPrompt('youtube.md');

    expect(rednote).toContain('governs the title itself');
    expect(youtube).toContain(
      'Write a platform-native video title under the shared headline policy.',
    );

    // A platform file that starts restating title strategy is how the four
    // copies drifted apart the first time.
    for (const prompt of [rednote, youtube]) {
      expect(prompt).not.toContain('## Title policy');
      expect(prompt).not.toContain('Title identity is load-bearing.');
    }
  });

  it('resolves the editorial-vs-platform contradiction about names', () => {
    const editorial = readPrompt('editorial.md');

    expect(editorial).toContain('Names earn their place by role, not by fame.');
    expect(editorial).toContain(
      'When both compete for the same space, the subject wins.',
    );

    // The rule this replaced told the writer to drop any name it did not
    // consider broadly recognizable, which contradicted the platform files'
    // requirement to keep the story's named subject.
    expect(editorial).not.toContain(
      "Keep a person's name only when they are broadly recognizable",
    );
    expect(editorial).not.toContain('When unsure, omit the name.');
  });
});
