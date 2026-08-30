import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('social topic telemetry boundary', () => {
  it('keeps topic out of cohort eligibility and publish policy', async () => {
    const sources = await Promise.all(
      ['cohort.ts', 'policy.ts'].map((filename) =>
        readFile(new URL(filename, import.meta.url), 'utf8'),
      ),
    );
    expect(sources.join('\n')).not.toMatch(/\btopic\b/iu);
  });
});
