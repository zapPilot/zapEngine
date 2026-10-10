import { isLive, type CapabilityId } from '../facts/capabilities.js';

export const BRAND_NAME = 'Zap Pilot';
export const SLOGAN_PARTS = [
  { word: 'strategy.', capability: 'reference-strategy' },
  { word: 'machine.', capability: 'self-hosting' },
  { word: 'wallet.', capability: 'wallet-signing', sign: true },
] as const satisfies readonly {
  word: string;
  capability: CapabilityId;
  sign?: boolean;
}[];
export const SLOGAN = 'Your strategy. Your machine. Your wallet.';
export const PUNCHLINE = 'Rules decide. You sign.';
export const ONE_LINER = {
  building:
    'Zap Pilot is building a self-hosted runtime for programmable portfolios.',
  final: 'Zap Pilot is a self-hosted runtime for programmable portfolios.',
} as const;
export const oneLiner = (): string =>
  isLive('self-hosting') ? ONE_LINER.final : ONE_LINER.building;
// Each kinetic word takes one style flag, and the signature word is always sign-ink (BRAND.md).
export const sloganLines = (): string[][] =>
  SLOGAN_PARTS.map((part) => [
    'Your',
    'sign' in part
      ? `${part.word}|s`
      : `${part.word}${isLive(part.capability) ? '' : '|o'}`,
  ]);
export const punchlineLines = (): string[][] => [
  ['Rules', 'decide.'],
  ['You', 'sign.|s'],
];
export { isLive, STATUS_LABEL } from '../facts/capabilities.js';
