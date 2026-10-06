import type { SceneSpec, Storyboard } from '../../timeline/types';
import {
  FILM,
  FILM_ORDER,
  type FilmBeatId,
  type FilmScene,
  type FilmSceneId,
  voLines,
} from './story';

// Every word, and the scene order, comes from the Kokode story
// (src/videos/kokode-clinic/story.ts). This file adds only timing and the cue
// phrases that key visuals to the narration. Captions are the Japanese `text`;
// narration is the English `say`, so cue phrases are English (see cueAt).

/** The story copy a scene renders. */
interface FilmProps {
  readonly beats: readonly FilmBeatId[];
  readonly film: FilmScene;
}

interface HookProps extends FilmProps {
  readonly variant: 'patient' | 'image';
  readonly headlineCue: string;
  /** The work hits the wall: the send button or the result locks. */
  readonly lockCue: string;
}

interface TurnProps extends FilmProps {
  readonly desireCue: string;
  readonly solutionCue: string;
  readonly browserCue: string;
}

interface PatientDemoProps extends FilmProps {
  readonly flowCue: string;
  readonly askCue: string;
  readonly draftCue: string;
}

interface ImageDemoProps extends FilmProps {
  readonly askCue: string;
  readonly sketchCue: string;
  readonly slideCue: string;
}

interface RevealProps extends FilmProps {
  readonly stackCue: string;
  readonly teamCue: string;
}

interface BoundaryProps extends FilmProps {
  readonly insideCue: string;
  readonly outsideCue: string;
}

interface CtaProps extends FilmProps {
  readonly askCue: string;
  readonly brandCue: string;
}

export type KokodeScene =
  | SceneSpec<'hook-patient', HookProps>
  | SceneSpec<'hook-content', HookProps>
  | SceneSpec<'turn', TurnProps>
  | SceneSpec<'demo-patient', PatientDemoProps>
  | SceneSpec<'demo-image', ImageDemoProps>
  | SceneSpec<'reveal', RevealProps>
  | SceneSpec<'boundary', BoundaryProps>
  | SceneSpec<'cta', CtaProps>;

const copy = (id: FilmSceneId): FilmProps => ({
  beats: FILM_ORDER.filter((scene) => scene.id === id).flatMap(
    (scene) => scene.beats,
  ),
  film: FILM[id],
});

const vo = (id: FilmSceneId) => voLines(FILM[id].lines);

/**
 * The film. Change words in packages/kokode-story/src/film.ts; change timing
 * and cues here. Then `pnpm voiceover kokode-clinic` and
 * `pnpm stills kokode-clinic`.
 */
export const storyboard = {
  id: 'kokode-clinic',
  poster: { scene: 'turn', at: 0.85 },
  fps: 30,
  width: 1920,
  height: 1080,
  maxSeconds: 90,
  transitionFrames: 12,
  leadIn: 14,
  tail: 18,
  gap: 10,
  music: {
    loop: 'gentle-88',
    base: 1,
    ducked: 0.2,
  },
  voice: { speed: 1, voice: 'adrian' },
  captions: { lang: 'ja', relation: 'translation' },
  scenes: [
    {
      id: 'hook-patient',
      leadIn: 36,
      vo: vo('hook-patient'),
      props: {
        ...copy('hook-patient'),
        variant: 'patient',
        headlineCue: 'The work',
        lockCue: 'patient data',
      },
    },
    {
      id: 'hook-content',
      leadIn: 24,
      vo: vo('hook-content'),
      props: {
        ...copy('hook-content'),
        variant: 'image',
        headlineCue: 'And the images',
        lockCue: 'off-limits',
      },
    },
    {
      id: 'turn',
      vo: vo('turn'),
      props: {
        ...copy('turn'),
        desireCue: 'What if',
        solutionCue: 'Kokode is',
        browserCue: 'open a browser',
      },
    },
    {
      id: 'demo-patient',
      tail: 36,
      vo: vo('demo-patient'),
      props: {
        ...copy('demo-patient'),
        flowCue: 'Patient data goes',
        askCue: 'Ask for a referral summary',
        draftCue: 'the draft',
      },
    },
    {
      id: 'demo-image',
      tail: 36,
      vo: vo('demo-image'),
      props: {
        ...copy('demo-image'),
        askCue: 'Need an anatomy figure',
        sketchCue: 'Sketch it',
        slideCue: 'drop it into your slides',
      },
    },
    {
      id: 'reveal',
      vo: vo('reveal'),
      props: {
        ...copy('reveal'),
        stackCue: 'Hardware',
        teamCue: 'Your team',
      },
    },
    {
      id: 'boundary',
      vo: vo('boundary'),
      props: {
        ...copy('boundary'),
        insideCue: 'staff network',
        outsideCue: 'From outside',
      },
    },
    {
      id: 'cta',
      tail: 75,
      vo: vo('cta'),
      props: {
        ...copy('cta'),
        askCue: 'Bring us one task',
        brandCue: 'AI, right here',
      },
    },
  ],
} as const satisfies Storyboard<KokodeScene>;
