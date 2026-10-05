import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../story/locales';
import { storyFor } from '../story/localized';
import { ogFingerprint } from './og';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
  readFileSync(path.join(root, 'scripts/og.manifest.json'), 'utf8'),
) as Record<string, string>;
describe.each(LOCALES)('%s sharing card', (locale) => {
  it('matches the story, layout and brand symbol; regenerate with og:render', () => {
    const fingerprint = createHash('sha256')
      .update(ogFingerprint(storyFor(locale)))
      .update(readFileSync(path.join(root, 'public/favicon.svg')))
      .digest('hex');
    expect(manifest[locale]).toBe(fingerprint);
    const png = readFileSync(path.join(root, `public/og/${locale}.png`));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
