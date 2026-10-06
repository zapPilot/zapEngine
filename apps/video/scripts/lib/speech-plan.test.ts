import { describe, expect, it } from 'vitest';

import { BRAND_CLIPS, planSpeech } from './speech-plan';

const voice = { voice: 'adrian' as const, speed: 1 };
const clip = { ...BRAND_CLIPS['kokode']!, status: 'approved' as const };
const registry = { kokode: clip };
describe('brand planning', () => {
  it('keeps candidates inert', () =>
    expect(planSpeech('Kokode is AI.', voice)).toEqual([
      { kind: 'tts', text: 'Kokode is AI.' },
    ]));
  it.each([
    [
      'Kokode is AI that runs inside your facility, built for your facility alone.',
      [
        { kind: 'clip', clip },
        {
          kind: 'tts',
          text: 'is AI that runs inside your facility, built for your facility alone.',
        },
      ],
    ],
    [
      'Hardware, model, agents and chat: Kokode sets it all up. Your team just uses it.',
      [
        { kind: 'tts', text: 'Hardware, model, agents and chat:' },
        { kind: 'pause', ms: 750 },
        { kind: 'clip', clip },
        { kind: 'tts', text: 'sets it all up. Your team just uses it.' },
      ],
    ],
    [
      'Kokode. AI, right here.',
      [
        { kind: 'clip', clip },
        { kind: 'pause', ms: 750 },
        { kind: 'tts', text: 'AI, right here.' },
      ],
    ],
    [
      'Use, Kokode; now.',
      [
        { kind: 'tts', text: 'Use,' },
        { kind: 'pause', ms: 550 },
        { kind: 'clip', clip },
        { kind: 'pause', ms: 550 },
        { kind: 'tts', text: 'now.' },
      ],
    ],
    ['Kokode.', [{ kind: 'clip', clip }]],
    [
      '(Kokode) is here.',
      [
        { kind: 'clip', clip },
        { kind: 'tts', text: 'is here.' },
      ],
    ],
    [
      'Kokode Kokode',
      [
        { kind: 'clip', clip },
        { kind: 'clip', clip },
      ],
    ],
  ])('plans %s', (text, expected) =>
    expect(planSpeech(text, voice, registry)).toEqual(expected),
  );
  it.each([
    'KOKODE',
    "Kokode's",
    'kokode.local',
    'Kokode-based',
    'Kokodex',
    'xKokode',
    'Kokode,next',
    'kokode',
  ])('rejects %s', (text) =>
    expect(() => planSpeech(text, voice, registry)).toThrow('Unsupported'),
  );
  it.each([
    { voice: 'hannah' as const, speed: 1 },
    { voice: 'adrian' as const, speed: 1.1 },
  ])('rejects wrong voice %j', (settings) =>
    expect(() => planSpeech('Kokode', settings, registry)).toThrow('requires'),
  );
  it('leaves ordinary narration alone', () =>
    expect(planSpeech('Hello!', voice, registry)).toEqual([
      { kind: 'tts', text: 'Hello!' },
    ]));
});
it('handles text without trailing punctuation', () =>
  expect(planSpeech('Kokode hello', voice, registry)).toEqual([
    { kind: 'clip', clip },
    { kind: 'tts', text: 'hello' },
  ]));

it('supports quoted exact tokens without accepting possessives', () => {
  expect(planSpeech("'Kokode' is here.", voice, registry)).toEqual([
    { kind: 'clip', clip },
    { kind: 'tts', text: 'is here.' },
  ]);
});
