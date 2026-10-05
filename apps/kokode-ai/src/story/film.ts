import { BEATS } from './ja/beats';
import { BEATS as ZH_BEATS } from './zh-Hant/beats';
import type { DemoId } from './ja/demos';
import type { FilmSceneId } from './narrative';
import type { BeatId, DisclaimerId } from './types';

/**
 * One narrated sentence: `ja` is the burned-in caption, `en` the narration.
 * They sit side by side so one diff reviews both. Editing `en` means paying
 * for the voiceover again (apps/video: pnpm voiceover kokode-clinic).
 */
export interface FilmLine {
  readonly id: string;
  readonly ja: string;
  readonly en: string;
  /** Draft translation, awaiting native-speaker review. */
  readonly 'zh-Hant': string;
}

/** What fills the frame: a chat window, a diagram or type alone. */
export type FilmScreen = 'chat' | 'diagram' | 'title';

export interface FilmScene {
  readonly lines: readonly FilmLine[];
  /** The scene's headline, one entry per line. */
  readonly headline: BeatId;
  readonly screen: FilmScreen;
  readonly demo?: DemoId;
  /** Footnotes burned into the scene. */
  readonly notes: readonly DisclaimerId[];
}

const joined = (lines: readonly string[]) => lines.join('');

// Scene order and beats come from FILM_ORDER (src/story/narrative.ts).
export const FILM: { readonly [Id in FilmSceneId]: FilmScene } = {
  'hook-patient': {
    lines: [
      {
        id: 'hook-patient',
        ja: joined(BEATS.painPatient.title),
        'zh-Hant': joined(ZH_BEATS.painPatient.title),
        en: 'The work you most want to hand to AI is exactly the work that holds patient data.',
      },
    ],
    headline: 'painPatient',
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient'],
  },
  'hook-content': {
    lines: [
      {
        id: 'hook-content',
        ja: joined(BEATS.painContent.title),
        'zh-Hant': joined(ZH_BEATS.painContent.title),
        en: 'And the images medicine needs may be off-limits in general-purpose AI tools.',
      },
    ],
    headline: 'painContent',
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage'],
  },
  turn: {
    lines: [
      {
        id: 'turn-desire',
        ja: joined(BEATS.desiredWorld.title),
        'zh-Hant': joined(ZH_BEATS.desiredWorld.title),
        en: 'What if AI felt as natural as ChatGPT, but stayed under your own control?',
      },
      {
        id: 'turn-solution',
        ja: 'KOKODEは、院内で動く施設専用のAIです。',
        'zh-Hant': 'KOKODE 是在院內運作、專屬於機構的 AI。',
        en: 'Kokode is AI that runs inside your facility, built for your facility alone.',
      },
      {
        id: 'turn-experience',
        ja: 'スタッフは、いつものブラウザを開くだけ。',
        'zh-Hant': '員工只要在院內網路打開瀏覽器。',
        en: 'Staff simply open a browser on the staff network. No one sits at a server.',
      },
    ],
    headline: 'desiredWorld',
    screen: 'chat',
    demo: 'chat',
    notes: ['screenImage'],
  },
  'demo-patient': {
    lines: [
      {
        id: 'demo-patient-flow',
        ja: '患者データは、院外ではなく院内のAIへ。',
        'zh-Hant': '患者資料交給院內的 AI，不送上雲端。',
        en: 'Patient data goes to the AI in your building, not out to the cloud.',
      },
      {
        id: 'demo-patient-draft',
        ja: '経過の要約も、紹介状の下書きも、院内で。',
        'zh-Hant': '病程摘要、轉診信草稿，都在院內撰寫。',
        en: 'Ask for a referral summary, and the draft is written right there, on site.',
      },
    ],
    headline: 'beforeAfter',
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient', 'draftOnly'],
  },
  'demo-image': {
    lines: [
      {
        id: 'demo-image',
        ja: '発表用の解剖図も、院内で下書きして、スライドへ。',
        'zh-Hant': '簡報用的解剖圖，也能在院內起草，再放入投影片。',
        en: 'Need an anatomy figure for a talk? Sketch it on site, then drop it into your slides.',
      },
    ],
    headline: 'demoImage',
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage', 'draftOnly'],
  },
  reveal: {
    lines: [
      {
        id: 'reveal',
        ja: '導入はKOKODE。使うのは、院内のチームです。',
        'zh-Hant': '由 KOKODE 整套導入，院內團隊直接使用。',
        en: 'Hardware, model, agents and chat: Kokode sets it all up. Your team just uses it.',
      },
    ],
    headline: 'turnkey',
    screen: 'diagram',
    notes: ['screenImage'],
  },
  boundary: {
    lines: [
      {
        id: 'boundary',
        ja: '院内にいるときだけ使えるAI。院外からは、つながりません。',
        'zh-Hant': '只有院內員工網路能使用，院外無法連線。',
        en: 'It works only while you are inside, on the staff network. From outside the building, it simply will not connect.',
      },
    ],
    headline: 'boundary',
    screen: 'diagram',
    notes: ['screenImage'],
  },
  cta: {
    lines: [
      {
        id: 'cta-ask',
        ja: 'クラウドには出せない業務を、1つお持ちください。',
        'zh-Hant': '帶來一項無法送上雲端、卻想交給 AI 的工作，一起在院內試行。',
        en: 'Bring us one task you would love to hand to AI but cannot send to the cloud, and we will try it with you on site.',
      },
      {
        id: 'cta-brand',
        ja: BEATS.hero.eyebrow,
        'zh-Hant': ZH_BEATS.hero.eyebrow,
        en: 'Kokode. AI, right here.',
      },
    ],
    headline: 'cta',
    screen: 'title',
    notes: ['notReplacement'],
  },
};
