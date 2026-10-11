import type { SceneSpec, Storyboard } from '../../timeline/types';
import { voLines } from '../kokode-clinic/story';
import { KOKODE_FILM } from '../kokode-clinic/storyboard';
import {
  PROMO,
  PROMO_ORDER,
  type PromoBeatId,
  type PromoSceneId,
} from './story';

// Every word, and the scene order, comes from the Kokode story
// (PROMO / PROMO_ORDER). This file adds only timing and the cue phrases that
// key visuals to the narration. Captions are the Japanese `text`; narration is
// the English `say`, so cue phrases are English (see cueAt).

interface PromoProps {
  readonly beats: readonly PromoBeatId[];
}

interface ColdOpenProps extends PromoProps {
  readonly headlineCue: string;
  readonly lockCue: string;
}

interface ColdImagesProps extends PromoProps {
  readonly headlineCue: string;
  readonly lockCue: string;
}

interface TurnProps extends PromoProps {
  readonly desireCue: string;
  readonly controlCue: string;
}

interface RevealProps extends PromoProps {
  readonly solutionCue: string;
  readonly offlineCue: string;
}

interface BrowserProps extends PromoProps {
  readonly browserCue: string;
  readonly signInCue: string;
  readonly askCue: string;
}

interface ReferralProps extends PromoProps {
  readonly flowCue: string;
  readonly cloudCue: string;
  readonly askCue: string;
  readonly draftCue: string;
}

interface DiagramProps extends PromoProps {
  readonly askCue: string;
  readonly sketchCue: string;
  readonly slideCue: string;
}

interface TurnkeyProps extends PromoProps {
  readonly stackCue: string;
  /** Each layer lands as it is named, bottom-up. */
  readonly modelCue: string;
  readonly knowledgeCue: string;
  readonly agentsCue: string;
  readonly chatCue: string;
  readonly setupCue: string;
  readonly ownCue: string;
}

interface BoundaryProps extends PromoProps {
  readonly insideCue: string;
  readonly outsideCue: string;
}

interface CtaProps extends PromoProps {
  readonly askCue: string;
  readonly brandCue: string;
}

export type PromoScene =
  | SceneSpec<'cold-open', ColdOpenProps>
  | SceneSpec<'cold-images', ColdImagesProps>
  | SceneSpec<'turn', TurnProps>
  | SceneSpec<'reveal', RevealProps>
  | SceneSpec<'browser', BrowserProps>
  | SceneSpec<'referral', ReferralProps>
  | SceneSpec<'diagram', DiagramProps>
  | SceneSpec<'turnkey', TurnkeyProps>
  | SceneSpec<'boundary', BoundaryProps>
  | SceneSpec<'cta', CtaProps>;

const beats = (id: PromoSceneId): readonly PromoBeatId[] =>
  PROMO_ORDER.filter((scene) => scene.id === id).flatMap(
    (scene) => scene.beats,
  );

const vo = (id: PromoSceneId) => voLines(PROMO[id].lines);

/**
 * The promo. Change words in packages/kokode-story/src/promo.ts; change timing
 * and cues here. Then `pnpm voiceover kokode-promo` and
 * `pnpm stills kokode-promo`. Scenes hard-cut on the beat of the music.
 */
export const storyboard = {
  id: 'kokode-promo',
  poster: { scene: 'reveal', at: 0.8 },
  ...KOKODE_FILM,
  maxSeconds: 110,
  transitionFrames: 0,
  beatGrid: true,
  leadIn: 14,
  tail: 18,
  gap: 10,
  music: { loop: 'launch-120', base: 1, ducked: 0.2 },
  scenes: [
    {
      id: 'cold-open',
      // Four workflow tiles land on the beat before the first word.
      leadIn: 96,
      vo: vo('cold-open'),
      props: {
        beats: beats('cold-open'),
        headlineCue: 'The work',
        lockCue: 'patient data',
      },
    },
    {
      id: 'cold-images',
      leadIn: 10,
      tail: 22,
      vo: vo('cold-images'),
      props: {
        beats: beats('cold-images'),
        headlineCue: 'And the images',
        lockCue: 'off-limits',
      },
    },
    {
      id: 'turn',
      leadIn: 12,
      tail: 14,
      vo: vo('turn'),
      props: {
        beats: beats('turn'),
        desireCue: 'What if',
        controlCue: 'under your own control',
      },
    },
    {
      id: 'reveal',
      // The drop and the orbit come before the voice; the tail dives in.
      leadIn: 50,
      tail: 36,
      vo: vo('reveal'),
      props: {
        beats: beats('reveal'),
        solutionCue: 'Kokode is',
        offlineCue: 'no internet',
      },
    },
    {
      id: 'browser',
      leadIn: 16,
      tail: 66,
      vo: vo('browser'),
      props: {
        beats: beats('browser'),
        browserCue: 'Open a browser',
        signInCue: 'sign in',
        askCue: 'like ChatGPT',
      },
    },
    {
      id: 'referral',
      // The chapter slab holds the frame before the voice.
      leadIn: 40,
      tail: 52,
      vo: vo('referral'),
      props: {
        beats: beats('referral'),
        flowCue: 'Patient data goes',
        cloudCue: 'not out to the cloud',
        askCue: 'Ask for a referral summary',
        draftCue: 'the draft',
      },
    },
    {
      id: 'diagram',
      leadIn: 40,
      tail: 52,
      vo: vo('diagram'),
      props: {
        beats: beats('diagram'),
        askCue: 'Need an anatomy figure',
        sketchCue: 'Sketch it',
        slideCue: 'into your slides',
      },
    },
    {
      id: 'turnkey',
      // The montage runs on the music alone before the voice.
      leadIn: 160,
      tail: 28,
      vo: vo('turnkey'),
      props: {
        beats: beats('turnkey'),
        stackCue: 'Hardware',
        modelCue: 'model',
        knowledgeCue: 'knowledge',
        agentsCue: 'agents',
        chatCue: 'chat',
        setupCue: 'Kokode sets it all up',
        ownCue: 'stays yours',
      },
    },
    {
      id: 'boundary',
      leadIn: 18,
      tail: 30,
      vo: vo('boundary'),
      props: {
        beats: beats('boundary'),
        insideCue: 'staff network',
        outsideCue: 'From outside',
      },
    },
    {
      id: 'cta',
      leadIn: 16,
      tail: 96,
      vo: vo('cta'),
      props: {
        beats: beats('cta'),
        askCue: 'Bring us one task',
        brandCue: 'AI, right here',
      },
    },
  ],
} as const satisfies Storyboard<PromoScene>;
