import { BEATS } from './beats';
import type { DemoId } from './demos';
import type { FilmSceneId } from './narrative';
import type { DisclaimerId } from './types';

/**
 * One narrated sentence: `ja` is the burned-in caption, `en` the narration.
 * They sit side by side so one diff reviews both. Editing `en` means paying
 * for the voiceover again (apps/video: pnpm voiceover kokode-clinic).
 */
export interface FilmLine {
  readonly id: string;
  readonly ja: string;
  readonly en: string;
}

/** What fills the frame: a chat window, a diagram or type alone. */
export type FilmScreen = 'chat' | 'diagram' | 'title';

export interface FilmScene {
  readonly lines: readonly FilmLine[];
  /** The scene's headline, one entry per line. */
  readonly headline: readonly string[];
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
        en: 'The work you most want to hand to AI is exactly the work that holds patient data.',
      },
    ],
    headline: BEATS.painPatient.title,
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient'],
  },
  'hook-content': {
    lines: [
      {
        id: 'hook-content',
        ja: joined(BEATS.painContent.title),
        en: 'And the images medicine needs may be off-limits in general-purpose AI tools.',
      },
    ],
    headline: BEATS.painContent.title,
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage'],
  },
  turn: {
    lines: [
      {
        id: 'turn-desire',
        ja: joined(BEATS.desiredWorld.title),
        en: 'What if AI felt as natural as ChatGPT, but stayed under your own control?',
      },
      {
        id: 'turn-solution',
        ja: 'KOKODEは、院内で動く施設専用のAIです。',
        en: 'Kokode is AI that runs inside your facility, built for your facility alone.',
      },
      {
        id: 'turn-experience',
        ja: 'スタッフは、いつものブラウザを開くだけ。',
        en: 'Staff simply open a browser on the staff network. No one sits at a server.',
      },
    ],
    headline: BEATS.desiredWorld.title,
    screen: 'chat',
    demo: 'chat',
    notes: ['screenImage'],
  },
  'demo-patient': {
    lines: [
      {
        id: 'demo-patient-flow',
        ja: '患者データは、院外ではなく院内のAIへ。',
        en: 'Patient data goes to the AI in your building, not out to the cloud.',
      },
      {
        id: 'demo-patient-draft',
        ja: '経過の要約も、紹介状の下書きも、院内で。',
        en: 'Ask for a referral summary, and the draft is written right there, on site.',
      },
    ],
    headline: BEATS.beforeAfter.title,
    screen: 'chat',
    demo: 'patient',
    notes: ['screenImage', 'fictionalPatient', 'draftOnly'],
  },
  'demo-image': {
    lines: [
      {
        id: 'demo-image',
        ja: '発表用の解剖図も、院内で下書きして、スライドへ。',
        en: 'Need an anatomy figure for a talk? Sketch it on site, then drop it into your slides.',
      },
    ],
    headline: BEATS.demoImage.title,
    screen: 'chat',
    demo: 'image',
    notes: ['screenImage', 'draftOnly'],
  },
  reveal: {
    lines: [
      {
        id: 'reveal',
        ja: '導入はKOKODE。使うのは、院内のチームです。',
        en: 'Hardware, model, agents and chat: Kokode sets it all up. Your team just uses it.',
      },
    ],
    headline: BEATS.turnkey.title,
    screen: 'diagram',
    notes: ['screenImage'],
  },
  boundary: {
    lines: [
      {
        id: 'boundary',
        ja: '院内にいるときだけ使えるAI。院外からは、つながりません。',
        en: 'It works only while you are inside, on the staff network. From outside the building, it simply will not connect.',
      },
    ],
    headline: BEATS.boundary.title,
    screen: 'diagram',
    notes: ['screenImage'],
  },
  cta: {
    lines: [
      {
        id: 'cta-ask',
        ja: 'クラウドには出せない業務を、1つお持ちください。',
        en: 'Bring us one task you would love to hand to AI but cannot send to the cloud, and we will try it with you on site.',
      },
      {
        id: 'cta-brand',
        ja: BEATS.hero.eyebrow,
        en: 'Kokode. AI, right here.',
      },
    ],
    headline: BEATS.cta.title,
    screen: 'title',
    notes: ['notReplacement'],
  },
};
