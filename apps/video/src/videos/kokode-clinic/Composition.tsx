import type { CSSProperties, FC } from 'react';

import {
  NarratedVideo,
  type SceneComponents,
} from '../../primitives/NarratedVideo';
import { captionVersion } from '../../timeline/versions';
import type { VideoProps } from '../metadata';
import { timelines } from './assets';
import { KokodeContext } from './context';
import { useLangFont } from './fonts';
import { KokodeBackdrop } from './primitives/KokodeBackdrop';
import { BoundaryScene } from './scenes/BoundaryScene';
import { CtaScene } from './scenes/CtaScene';
import { DemoScene } from './scenes/DemoScene';
import { HookScene } from './scenes/HookScene';
import { RevealScene } from './scenes/RevealScene';
import { TurnScene } from './scenes/TurnScene';
import { filmStory } from './story';
import { type KokodeScene, storyboard } from './storyboard';
import { theme } from './theme';

// Exhaustive by type: a scene added to the story's FILM_ORDER (and so to the
// storyboard) without a component here fails type-check.
const SCENES: SceneComponents<KokodeScene> = {
  'hook-patient': HookScene,
  'hook-content': HookScene,
  turn: TurnScene,
  'demo-patient': DemoScene,
  'demo-image': DemoScene,
  reveal: RevealScene,
  boundary: BoundaryScene,
  cta: CtaScene,
};

/** Localized captions on a light card, matching the site. */
const CAPTION_STYLE: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.94)',
  border: `1px solid ${theme.line}`,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)',
  color: theme.ink,
  fontWeight: 600,
  fontSize: 46,
  letterSpacing: '0.02em',
};

export const KokodeClinic: FC<VideoProps> = (props) => (
  <LocalizedClinic key={props.lang} {...props} />
);

const LocalizedClinic: FC<VideoProps> = ({ captions, music, lang }) => {
  const fontFamily = useLangFont(lang);
  return (
    <KokodeContext.Provider
      value={{ lang, story: filmStory(lang), fontFamily }}
    >
      <NarratedVideo
        storyboard={captionVersion(storyboard, lang)}
        timeline={timelines[lang]}
        scenes={SCENES}
        captions={captions}
        music={music}
        background={theme.bg}
        backdrop={<KokodeBackdrop />}
        captionStyle={{ ...CAPTION_STYLE, fontFamily }}
      />
    </KokodeContext.Provider>
  );
};
