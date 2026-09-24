import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REDNOTE_PROMPT = new URL(
  '../../prompts/social/rednote.md',
  import.meta.url,
);

describe('Rednote canonical title policy', () => {
  it('forbids generating a second platform-specific title', async () => {
    const prompt = await readFile(REDNOTE_PROMPT, 'utf8');

    expect(prompt).toContain(
      'The episode title is already finalized upstream and is published unchanged',
    );
    expect(prompt).toContain(
      'do not generate, rewrite, shorten, or optimize another Rednote-specific title',
    );
    expect(prompt).not.toContain('`title`: a curiosity-driven consumer title');
  });

  it('keeps finance and crypto framing rules on the body and topics', async () => {
    const prompt = await readFile(REDNOTE_PROMPT, 'utf8');

    expect(prompt).toContain(
      'Do not replace a material subject such as Virtuals, Ethereum, Bitcoin',
    );
    expect(prompt).toContain(
      'Never recommend buying, selling or holding an asset',
    );
  });
});
