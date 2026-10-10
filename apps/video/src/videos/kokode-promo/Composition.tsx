import type { CSSProperties, FC } from 'react';

import {
  NarratedVideo,
  type SceneComponents,
} from '../../primitives/NarratedVideo';
import { framesPerBeat } from '../../timeline/grid';
import { captionVersion } from '../../timeline/versions';
import { KokodeContext } from '../kokode-clinic/context';
import { useLangFont } from '../kokode-clinic/fonts';
import { KokodeBackdrop } from '../kokode-clinic/primitives/KokodeBackdrop';
import { theme } from '../kokode-clinic/theme';
import type { VideoProps } from '../metadata';
import { timelines } from './assets';
import { PromoContext, promoCopy } from './context';
import { Boundary } from './scenes/Boundary';
import { BrowserScene } from './scenes/BrowserScene';
import { ColdImages } from './scenes/ColdImages';
import { ColdOpen } from './scenes/ColdOpen';
import { Cta } from './scenes/Cta';
import { Diagram } from './scenes/Diagram';
import { Referral } from './scenes/Referral';
import { Reveal } from './scenes/Reveal';
import { Turn } from './scenes/Turn';
import { Turnkey } from './scenes/Turnkey';
import { type PromoScene, storyboard } from './storyboard';

// Exhaustive by type: a scene added to PROMO_ORDER (and so to the storyboard)
// without a component here fails type-check.
const SCENES: SceneComponents<PromoScene> = {
  'cold-open': ColdOpen,
  'cold-images': ColdImages,
  turn: Turn,
  reveal: Reveal,
  browser: BrowserScene,
  referral: Referral,
  diagram: Diagram,
  turnkey: Turnkey,
  boundary: Boundary,
  cta: Cta,
};

/** Frosted captions bottom left, out of the way of the kinetic type. */
const CAPTION_STYLE: CSSProperties = {
  maxWidth: 1080,
  background: 'rgba(255, 255, 255, 0.9)',
  border: `1px solid ${theme.line}`,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)',
  color: theme.ink,
  fontWeight: 600,
  letterSpacing: '0.01em',
  textAlign: 'left',
};

const CAPTION_PLACEMENT: CSSProperties = {
  alignItems: 'flex-start',
  paddingLeft: 140,
  paddingBottom: 54,
};

const perBeat = framesPerBeat(storyboard.music.loop);

export const KokodePromo: FC<VideoProps> = (props) => (
  <LocalizedPromo key={props.lang} {...props} />
);

const LocalizedPromo: FC<VideoProps> = ({ captions, music, lang }) => {
  const fontFamily = useLangFont(lang);
  const story = promoCopy(lang);
  return (
    <KokodeContext.Provider value={{ lang, story, fontFamily }}>
      <PromoContext.Provider value={{ lang, story, fontFamily, perBeat }}>
        <NarratedVideo
          storyboard={captionVersion(storyboard, lang)}
          timeline={timelines[lang]}
          scenes={SCENES}
          captions={captions}
          music={music}
          background={theme.bg}
          backdrop={<KokodeBackdrop />}
          captionStyle={{
            ...CAPTION_STYLE,
            fontFamily,
            fontSize: lang === 'en' ? 32 : 36,
          }}
          captionPlacement={CAPTION_PLACEMENT}
        />
      </PromoContext.Provider>
    </KokodeContext.Provider>
  );
};
