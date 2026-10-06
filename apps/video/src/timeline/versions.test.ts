import { describe, expect, it } from 'vitest';

import { storyboard as calculator } from '../videos/calculator-pitch/storyboard';
import { storyboard } from '../videos/kokode-clinic/storyboard';
import { CAPTION_PROFILES } from './captions';
import { fullWidth } from './cjk';
import { buildTimeline, readingRates } from './timeline';
import type { SceneSpec } from './types';
import { captionLangs, captionVersion } from './versions';
import { VOICES } from './voices';

const manifest = {
  videoId: storyboard.id,
  engine: '',
  voiceKey: '',
  lines: {},
};

describe('caption versions', () => {
  it('lists versions in stable order, with a single default English version', () => {
    expect(captionLangs(storyboard)).toEqual(['ja', 'en', 'zh-Hant']);
    expect(captionLangs(calculator)).toEqual(['en']);
    expect(captionLangs({ ...calculator, scenes: [] })).toEqual(['en']);
  });
  it('changes captions without changing narration, duration or props', () => {
    const base = buildTimeline(storyboard, manifest);
    for (const lang of captionLangs(storyboard)) {
      const version = captionVersion(storyboard, lang);
      expect(version.captions).toEqual({
        lang,
        relation: lang === 'en' ? 'transcript' : 'translation',
      });
      expect(version.scenes[0]?.props).toBe(storyboard.scenes[0]?.props);
      for (const [index, scene] of version.scenes.entries()) {
        for (const [lineIndex, line] of scene.vo.entries()) {
          const original = storyboard.scenes[index]?.vo[lineIndex];
          expect(line.say).toBe(original?.say);
          expect(line.text).toBe(
            lang === 'ja' ? original?.text : original?.translations?.[lang],
          );
        }
      }
      const timeline = buildTimeline(version, manifest);
      expect(timeline.durationInFrames).toBe(base.durationInFrames);
      if (lang === 'zh-Hant')
        expect(readingRates(version, timeline)).not.toHaveLength(0);
    }
    expect(
      captionVersion<SceneSpec>(calculator, 'en').scenes[0]?.vo[0]?.say,
    ).toBe(calculator.scenes[0]?.vo[0]?.text);
  });
  it('rejects incomplete translations', () => {
    expect(() => captionVersion(calculator, 'zh-Hant')).toThrow(
      'Missing zh-Hant caption',
    );
  });
});

describe('traditional Chinese caption profile', () => {
  it('splits sentences and long clauses, preserving punctuation and Latin words', () => {
    const text =
      '患者資料留在院內。請在員工網路打開 kokode.local，交辦一項工作，草稿由醫師確認。';
    const profile = CAPTION_PROFILES['zh-Hant'];
    const phrases = profile.split(text);
    expect(phrases.join('')).toBe(text);
    expect(phrases.length).toBeGreaterThan(2);
    for (const phrase of phrases)
      expect(fullWidth(phrase)).toBeLessThanOrEqual(profile.maxUnits);
    expect(phrases.some((phrase) => phrase.includes('kokode.local'))).toBe(
      true,
    );
    expect(profile.weigh('資料，確認。')).toBeGreaterThan(4);
    expect(
      profile
        .split('院內'.repeat(40))
        .every((phrase) => fullWidth(phrase) <= profile.maxUnits),
    ).toBe(true);
  });
});

describe('official voices', () => {
  it('registers seven unique public presets', () => {
    expect(Object.keys(VOICES)).toHaveLength(7);
    expect(new Set(Object.values(VOICES).map((voice) => voice.id)).size).toBe(
      7,
    );
    for (const voice of Object.values(VOICES))
      expect(voice.id).toMatch(/^[a-f0-9]{32}$/);
  });
});
