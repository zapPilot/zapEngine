import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { arcViolations } from '@zapengine/kokode-story';
import { describe, expect, it } from 'vitest';

import {
  lineFingerprint,
  staleLines,
  voiceKey,
} from '../../../scripts/lib/vo-cache';
import { cueAt, cuePhrases, unspokenCues } from '../../timeline/beats';
import { CAPTION_PROFILES } from '../../timeline/captions';
import {
  endsAtBreak,
  fullWidth,
  hasJapanese,
  JA_MAX_CPS,
  MIN_CAPTION_SECONDS,
} from '../../timeline/cjk';
import { framesPerBeat } from '../../timeline/grid';
import { parseVoManifest } from '../../timeline/manifest';
import { readingRates } from '../../timeline/timeline';
import { captionVersion } from '../../timeline/versions';
import { VOICES } from '../../timeline/voices';
import { getVideo, videoIds } from '../catalog';
import { voLines } from '../kokode-clinic/story';
import { timelines } from './assets';
import { PROMO, PROMO_ORDER, promoStory } from './story';
import { storyboard } from './storyboard';
import voJson from './vo.manifest.json';

// This file lives where no Japanese literal may appear, so it reads every
// Japanese string from the story.

const videoRoot = path.resolve(import.meta.dirname, '../../..');

describe('kokode-promo follows the story', () => {
  it('plays the scenes in PROMO_ORDER with their beats', () => {
    expect(storyboard.scenes.map((scene) => scene.id)).toEqual(
      PROMO_ORDER.map((scene) => scene.id),
    );
    for (const [index, scene] of storyboard.scenes.entries()) {
      expect(scene.props.beats).toEqual(PROMO_ORDER[index]?.beats);
    }
    expect(arcViolations(PROMO_ORDER)).toEqual([]);
  });

  it('narrates exactly the promo lines of the story, in English', () => {
    for (const scene of storyboard.scenes) {
      expect(scene.vo).toEqual(voLines(PROMO[scene.id].lines));
      for (const line of scene.vo) {
        expect(hasJapanese(line.text), line.id).toBe(true);
        expect(hasJapanese(line.say ?? ''), line.id).toBe(false);
      }
    }
  });

  it('keys every visual to a phrase heard in exactly one line', () => {
    expect(unspokenCues(storyboard)).toEqual([]);
    for (const scene of timelines.ja.scenes) {
      for (const cue of cuePhrases(scene.spec.props)) {
        expect(
          () => cueAt(scene, cue),
          `${scene.spec.id}: ${cue}`,
        ).not.toThrow();
      }
    }
  });

  it('prints the footnotes every scene needs', () => {
    for (const locale of ['ja', 'en', 'zh-Hant'] as const) {
      const story = promoStory(locale);
      for (const scene of Object.values(story.PROMO)) {
        for (const note of scene.notes)
          expect(story.FOOTNOTES[note]).toBeTruthy();
      }
    }
  });

  it('hard-cuts on the beat of a 120 BPM loop', () => {
    expect(storyboard.transitionFrames).toBe(0);
    expect(framesPerBeat(storyboard.music.loop)).toBeCloseTo(15, 1);
    const perBeat = framesPerBeat(storyboard.music.loop);
    for (const scene of timelines.ja.scenes) {
      const beats = scene.from / perBeat;
      expect(
        Math.abs(beats - Math.round(beats)) * perBeat,
        scene.spec.id,
      ).toBeLessThanOrEqual(0.5);
    }
  });
});

describe.each(['ja', 'en', 'zh-Hant'] as const)(
  'kokode-promo %s captions',
  (lang) => {
    const timeline = timelines[lang];
    const version = captionVersion(storyboard, lang);
    it('fits one caption line and stays long enough to read', () => {
      expect(timeline.captions.length).toBeGreaterThan(0);
      for (const cue of timeline.captions) {
        expect(
          lang === 'en' ? cue.text.length : fullWidth(cue.text),
          cue.text,
        ).toBeLessThanOrEqual(CAPTION_PROFILES[lang].maxUnits);
        if (lang !== 'en') {
          expect(endsAtBreak(cue.text), cue.text).toBe(true);
          expect(
            (cue.to - cue.from) / storyboard.fps,
            cue.text,
          ).toBeGreaterThanOrEqual(MIN_CAPTION_SECONDS);
        }
      }
      for (const rate of readingRates(version, timeline)) {
        expect(rate.cps, rate.lineId).toBeLessThanOrEqual(JA_MAX_CPS);
      }
      expect(timeline.voice).toEqual(timelines.ja.voice);
      expect(timeline.durationInFrames).toBe(timelines.ja.durationInFrames);
    });
  },
);

describe('kokode-promo narration', () => {
  const manifest = parseVoManifest(voJson);

  it('uses the Kokode voice and complete, current narration', () => {
    expect(storyboard.voice.voice).toBe('adrian');
    expect(manifest.videoId).toBe(storyboard.id);
    expect(manifest.voiceKey).toBe(
      voiceKey(manifest.engine, VOICES[storyboard.voice.voice].id),
    );
    expect(staleLines(storyboard, manifest)).toEqual([]);
    const lines = new Map(
      storyboard.scenes.flatMap((scene) =>
        scene.vo.map((line) => [line.id, line] as const),
      ),
    );
    for (const [id, clip] of Object.entries(manifest.lines)) {
      const line = lines.get(id);
      expect(line, id).toBeDefined();
      if (line !== undefined)
        expect(clip.fingerprint, id).toBe(
          lineFingerprint(line, storyboard.voice),
        );
    }
  });

  it('runs under two minutes', () => {
    const seconds = timelines.ja.durationInFrames / storyboard.fps;
    expect(seconds).toBeGreaterThanOrEqual(75);
    expect(seconds).toBeLessThanOrEqual(storyboard.maxSeconds);
    expect(storyboard.maxSeconds).toBeLessThan(120);
  });

  it('is registered without product captures', () => {
    expect(videoIds).toContain(storyboard.id);
    expect(getVideo(storyboard.id).shots).toBeUndefined();
  });
});

describe('no copy outside the story', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it('has no Japanese or Chinese literal in the promo', () => {
    const scanned = files(path.join(videoRoot, 'src/videos/kokode-promo'));
    expect(scanned.length).toBeGreaterThan(20);
    const stray = scanned.filter((file) =>
      hasJapanese(readFileSync(file, 'utf8')),
    );
    expect(stray.map((file) => path.relative(videoRoot, file))).toEqual([]);
  });
});
