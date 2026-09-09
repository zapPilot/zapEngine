import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REDNOTE_PROMPT = new URL(
  '../../prompts/social/rednote.md',
  import.meta.url,
);

describe('Rednote title policy', () => {
  it('keeps concrete finance and crypto subjects instead of safety-genericizing them', async () => {
    const prompt = await readFile(REDNOTE_PROMPT, 'utf8');

    expect(prompt).toContain(
      'Rednote must use the same underlying editorial/title strategy as the other social platforms',
    );
    expect(prompt).toContain(
      'Do not replace a material subject such as Virtuals, Ethereum, Bitcoin',
    );
    expect(prompt).toContain(
      'Exact finance and crypto terminology is allowed when it is central to the episode',
    );
    expect(prompt).not.toContain('Prefer neutral topic labels such as');
    expect(prompt).not.toContain(
      'instead of leading with the asset label when a broader description is still accurate',
    );
  });

  it('keeps format and investment-direction constraints separate from topic identity', async () => {
    const prompt = await readFile(REDNOTE_PROMPT, 'utf8');

    expect(prompt).toContain('`title`: a curiosity-driven consumer title, at most 20 characters.');
    expect(prompt).toContain('Never recommend buying, selling or holding an asset');
    expect(prompt).toContain(
      "they must not be interpreted as a reason to erase the episode's named subject from the title",
    );
  });
});
