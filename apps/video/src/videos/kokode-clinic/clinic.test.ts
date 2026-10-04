import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { lineFingerprint } from '../../../scripts/lib/vo-cache';
import { cueAt, cuePhrases, unspokenCues } from '../../timeline/beats';
import {
  endsAtBreak,
  fullWidth,
  hasJapanese,
  JA_MAX_CPS,
  MAX_JA_CAPTION_UNITS,
  MIN_CAPTION_SECONDS,
} from '../../timeline/cjk';
import { parseVoManifest } from '../../timeline/manifest';
import { readingRates } from '../../timeline/timeline';
import { getVideo, videoIds } from '../catalog';
import { timeline } from './assets';
import { arcViolations, DEMOS, FILM, FILM_ORDER, voLines } from './story';
import { storyboard } from './storyboard';
import { CSS_VARIABLES, theme } from './theme';
import voJson from './vo.manifest.json';

// This file lives where no Japanese literal may appear, so it reads every
// Japanese string from the story.

const videoRoot = path.resolve(import.meta.dirname, '../../..');
const kokodeRoot = path.resolve(videoRoot, '../kokode-ai');

describe('kokode-clinic follows the story', () => {
  it('plays the scenes in FILM_ORDER with their beats', () => {
    expect(storyboard.scenes.map((scene) => scene.id)).toEqual(
      FILM_ORDER.map((scene) => scene.id),
    );
    for (const [index, scene] of storyboard.scenes.entries()) {
      expect(scene.props.beats).toEqual(FILM_ORDER[index]?.beats);
      expect(scene.props.film).toBe(FILM[scene.id]);
    }
  });

  it('narrates exactly the film lines of the story', () => {
    for (const scene of storyboard.scenes) {
      expect(scene.vo).toEqual(voLines(FILM[scene.id].lines));
      for (const line of scene.vo) {
        expect(hasJapanese(line.text), line.id).toBe(true);
        expect(line.say, line.id).toBeTruthy();
        expect(hasJapanese(line.say ?? ''), line.id).toBe(false);
      }
    }
  });

  it('keeps the story arc', () => {
    expect(
      arcViolations(
        storyboard.scenes.map((scene) => ({
          id: scene.id,
          beats: scene.props.beats,
        })),
      ),
    ).toEqual([]);
  });

  it('keys every visual to a phrase heard in exactly one line', () => {
    expect(unspokenCues(storyboard)).toEqual([]);
    for (const scene of timeline.scenes) {
      for (const cue of cuePhrases(scene.spec.props)) {
        expect(
          () => cueAt(scene, cue),
          `${scene.spec.id}: ${cue}`,
        ).not.toThrow();
      }
    }
  });

  it('notes the screen image and fictional data wherever they appear', () => {
    for (const scene of storyboard.scenes) {
      const { film } = scene.props;
      if (film.screen === 'chat' || film.screen === 'diagram') {
        expect(film.notes, scene.id).toContain('screenImage');
      }
      if (film.demo !== undefined) {
        const showsRecord =
          DEMOS[film.demo].disclaimers.includes('fictionalPatient');
        if (showsRecord)
          expect(film.notes, scene.id).toContain('fictionalPatient');
      }
    }
  });
});

describe('kokode-clinic captions', () => {
  const seconds = (frames: number) => frames / storyboard.fps;

  it('fit one line and end at a break', () => {
    expect(timeline.captions.length).toBeGreaterThan(0);
    for (const cue of timeline.captions) {
      expect(fullWidth(cue.text), cue.text).toBeLessThanOrEqual(
        MAX_JA_CAPTION_UNITS,
      );
      expect(endsAtBreak(cue.text), cue.text).toBe(true);
    }
  });

  it('stay on screen long enough to read', () => {
    for (const cue of timeline.captions) {
      expect(seconds(cue.to - cue.from), cue.text).toBeGreaterThanOrEqual(
        MIN_CAPTION_SECONDS,
      );
    }
    const rates = readingRates(storyboard, timeline);
    expect(rates).toHaveLength(
      storyboard.scenes.flatMap((scene) => scene.vo).length,
    );
    for (const rate of rates) {
      expect(rate.cps, rate.lineId).toBeLessThanOrEqual(JA_MAX_CPS);
    }
  });
});

describe('kokode-clinic narration', () => {
  const manifest = parseVoManifest(voJson);

  it('holds no clip for words that changed (re-run pnpm voiceover)', () => {
    expect(manifest.videoId).toBe(storyboard.id);
    const lines = new Map(
      storyboard.scenes.flatMap((scene) =>
        scene.vo.map((line) => [line.id, line] as const),
      ),
    );
    for (const [id, clip] of Object.entries(manifest.lines)) {
      const line = lines.get(id);
      expect(line, id).toBeDefined();
      if (line !== undefined) {
        expect(clip.fingerprint, id).toBe(
          lineFingerprint(line, storyboard.voice),
        );
      }
    }
  });

  it('lasts 60 to 90 seconds', () => {
    const length = timeline.durationInFrames / storyboard.fps;
    expect(length).toBeGreaterThanOrEqual(60);
    expect(length).toBeLessThanOrEqual(storyboard.maxSeconds);
  });

  it('is registered without product captures', () => {
    expect(videoIds).toContain(storyboard.id);
    expect(getVideo(storyboard.id).shots).toBeUndefined();
  });
});

describe('kokode-clinic brand', () => {
  it('uses the site palette', () => {
    const css = readFileSync(
      path.join(kokodeRoot, 'src/styles/base.css'),
      'utf8',
    );
    // The :root block, as `--name: value;` declarations.
    const open = css.indexOf('{', css.indexOf(':root'));
    const declared = new Map(
      css
        .slice(open + 1, css.indexOf('}', open))
        .split(';')
        .map((declaration) => declaration.split(':').map((part) => part.trim()))
        .flatMap(([name = '', value = '']) =>
          name.startsWith('--') ? [[name, value] as const] : [],
        ),
    );
    for (const [token, variable] of Object.entries(CSS_VARIABLES)) {
      expect(declared.get(variable), token).toBe(
        theme[token as keyof typeof theme],
      );
    }
    const byName = (a: string, b: string) => a.localeCompare(b);
    const colors = [...declared].filter(([, value]) => value.startsWith('#'));
    expect(colors.map(([name]) => name).sort(byName)).toEqual(
      Object.values(CSS_VARIABLES).sort(byName),
    );
  });

  it('shows the site favicon as its mark, byte for byte', () => {
    expect(
      readFileSync(path.join(videoRoot, 'public/brand/kokode-mark.svg')),
    ).toEqual(readFileSync(path.join(kokodeRoot, 'public/favicon.svg')));
  });
});

describe('no copy outside the story', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it('has no Japanese literal in the film or the shared primitives', () => {
    const scanned = [
      ...files(path.join(videoRoot, 'src/videos/kokode-clinic')),
      ...files(path.join(videoRoot, 'src/primitives')),
    ];
    expect(scanned.length).toBeGreaterThan(30);
    const stray = scanned.filter((file) =>
      hasJapanese(readFileSync(file, 'utf8')),
    );
    expect(stray.map((file) => path.relative(videoRoot, file))).toEqual([]);
  });
});
