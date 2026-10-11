import type { VoManifest } from './manifest';
import { buildTimeline, type Timeline } from './timeline';
import {
  CAPTION_LANGS,
  type CaptionLang,
  type SceneSpec,
  type Storyboard,
} from './types';

/** Available caption versions in a stable order. */
export function captionLangs(storyboard: Storyboard): CaptionLang[] {
  const available = new Set<CaptionLang>([storyboard.captions?.lang ?? 'en']);
  for (const line of storyboard.scenes.flatMap((scene) => scene.vo)) {
    for (const lang of CAPTION_LANGS) {
      if (line.translations?.[lang] !== undefined) available.add(lang);
    }
  }
  return CAPTION_LANGS.filter((lang) => available.has(lang));
}

/** Switch only what is read; preserve the spoken words and all scene props. */
export function captionVersion<Scene extends SceneSpec>(
  storyboard: Storyboard<Scene>,
  lang: CaptionLang,
): Storyboard<Scene> {
  const original = storyboard.captions?.lang ?? 'en';
  return {
    ...storyboard,
    captions: { lang, relation: lang === 'en' ? 'transcript' : 'translation' },
    scenes: storyboard.scenes.map((scene) => ({
      ...scene,
      vo: scene.vo.map((line) => {
        const text = lang === original ? line.text : line.translations?.[lang];
        if (text === undefined)
          throw new Error(`Missing ${lang} caption for ${line.id}.`);
        return { ...line, text, say: line.say ?? line.text };
      }),
    })),
  };
}

/** One timeline per caption language; all share the narration and its timing. */
export function captionTimelines<Scene extends SceneSpec>(
  storyboard: Storyboard<Scene>,
  manifest: VoManifest,
): Record<CaptionLang, Timeline<Scene>> {
  return {
    ja: buildTimeline(captionVersion(storyboard, 'ja'), manifest),
    en: buildTimeline(captionVersion(storyboard, 'en'), manifest),
    'zh-Hant': buildTimeline(captionVersion(storyboard, 'zh-Hant'), manifest),
  };
}
