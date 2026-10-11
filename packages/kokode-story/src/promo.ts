import { FILM, type FilmLine, type FilmScreen } from './film.js';
import type { DemoId } from './ja/demos.js';
import type { FilmSceneId, PromoSceneId } from './narrative.js';
import type { DisclaimerId } from './types.js';

/** What fills the frame; `hardware` is the drawn KOKODE device. */
export type PromoScreen = FilmScreen | 'hardware';

export interface PromoScene {
  readonly lines: readonly FilmLine[];
  readonly screen: PromoScreen;
  readonly demo?: DemoId;
  /** Footnotes burned into the scene. */
  readonly notes: readonly DisclaimerId[];
}

/** One film line the promo narrates word for word, so both films say the same. */
const filmLine = (scene: FilmSceneId, id: string): readonly FilmLine[] =>
  FILM[scene].lines.filter((line) => line.id === id);

// Scene order and beats come from PROMO_ORDER (narrative.ts). The promo reuses
// the reviewed film narration; only the browser line is its own. Editing an
// `en` line means synthesising the voiceover again (pnpm voiceover kokode-promo).
export const PROMO: { readonly [Id in PromoSceneId]: PromoScene } = {
  'cold-open': {
    lines: FILM['hook-patient'].lines,
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient'],
  },
  'cold-images': {
    lines: FILM['hook-content'].lines,
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage'],
  },
  turn: {
    lines: filmLine('turn', 'turn-desire'),
    screen: 'title',
    notes: [],
  },
  reveal: {
    lines: filmLine('turn', 'turn-solution'),
    screen: 'hardware',
    notes: ['hardwareImage', 'normalOperation'],
  },
  browser: {
    lines: [
      {
        id: 'promo-browser',
        ja: 'ブラウザを開いて、ChatGPTのように聞くだけ。',
        'zh-Hant': '打開瀏覽器登入，像用 ChatGPT 一樣直接問。',
        en: 'Open a browser on the staff network, sign in, and just ask, like ChatGPT.',
      },
    ],
    screen: 'chat',
    demo: 'chat',
    notes: ['screenImage'],
  },
  referral: {
    lines: FILM['demo-patient'].lines,
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient', 'draftOnly', 'normalOperation'],
  },
  diagram: {
    lines: FILM['demo-image'].lines,
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage', 'draftOnly'],
  },
  turnkey: {
    lines: FILM.reveal.lines,
    screen: 'diagram',
    notes: ['screenImage', 'hardwareImage'],
  },
  boundary: {
    lines: FILM.boundary.lines,
    screen: 'diagram',
    notes: ['screenImage'],
  },
  cta: {
    lines: FILM.cta.lines,
    screen: 'title',
    notes: ['notReplacement'],
  },
};
