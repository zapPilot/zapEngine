import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { CAPABILITIES, type CapabilityStatus } from '../facts/capabilities.js';
import {
  BRAND_NAME,
  SLOGAN,
  SLOGAN_PARTS,
  PUNCHLINE,
  ONE_LINER,
  oneLiner,
  sloganLines,
  punchlineLines,
  STATUS_LABEL,
} from './index.js';

const original = Object.values(CAPABILITIES).map((part) => part.status);
afterEach(() =>
  Object.values(CAPABILITIES).forEach((part, i) => {
    (part as { status: CapabilityStatus }).status = original[i]!;
  }),
);
it('pins the verbal identity and derives availability from capabilities', () => {
  expect(BRAND_NAME).toBe('Zap Pilot');
  expect(SLOGAN).toBe('Your strategy. Your machine. Your wallet.');
  expect(PUNCHLINE).toBe('Rules decide. You sign.');
  expect(ONE_LINER).toEqual({
    building:
      'Zap Pilot is building a self-hosted runtime for programmable portfolios.',
    final: 'Zap Pilot is a self-hosted runtime for programmable portfolios.',
  });
  expect(oneLiner()).toBe(ONE_LINER.building);
  expect(sloganLines()).toEqual([
    ['Your', 'strategy.'],
    ['Your', 'machine.|o'],
    ['Your', 'wallet.|s'],
  ]);
  expect(punchlineLines()).toEqual([
    ['Rules', 'decide.'],
    ['You', 'sign.|s'],
  ]);
  expect(
    punchlineLines()
      .flat()
      .map((word) => word.split('|')[0])
      .join(' '),
  ).toBe(PUNCHLINE);
  (CAPABILITIES['self-hosting'] as { status: CapabilityStatus }).status =
    'live';
  expect(oneLiner()).toBe(ONE_LINER.final);
  expect(sloganLines()[1]).toEqual(['Your', 'machine.']);
  (CAPABILITIES['wallet-signing'] as { status: CapabilityStatus }).status =
    'planned';
  expect(sloganLines()[2]).toEqual(['Your', 'wallet.|s']);
});
it('keeps the browser-free entry dependent only on capability facts', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  expect(
    [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]),
  ).toEqual(['../facts/capabilities.js', '../facts/capabilities.js']);
});

it('matches the generated wordmark, slogan styles and status label', () => {
  const glyphs = JSON.parse(
    readFileSync(
      new URL('../../../design-tokens/brand/glyphs.json', import.meta.url),
      'utf8',
    ),
  );
  expect(glyphs.wordmark.text).toBe(BRAND_NAME);
  expect(
    glyphs.slogan
      .map((line: { word: string }[]) =>
        line.map((word) => word.word).join(' '),
      )
      .join(' '),
  ).toBe(SLOGAN);
  expect(
    glyphs.slogan.map((line: { word: string; style: string }[]) =>
      line.map((word) => word.word + (word.style ? `|${word.style}` : '')),
    ),
  ).toEqual(sloganLines());
  expect(
    glyphs.slogan.map((line: { word: string }[]) => line[1]!.word),
  ).toEqual(SLOGAN_PARTS.map((part) => part.word));
  expect(glyphs.status.text).toBe(
    STATUS_LABEL[CAPABILITIES['self-hosting'].status].toUpperCase(),
  );
});
