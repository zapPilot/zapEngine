import { createContext, useContext } from 'react';

import type { CaptionLang } from '../../timeline/types';
import { filmStory } from '../kokode-clinic/story';
import { promoStory } from './story';

/**
 * The promo's copy. It also carries the clinic film's screen copy, because
 * the promo reuses the clinic's chat, diagram and footnote primitives, which
 * read it from KokodeContext; both come from the same story package.
 */
export function promoCopy(lang: CaptionLang) {
  return { ...filmStory(lang), ...promoStory(lang) };
}

export const PromoContext = createContext({
  lang: 'ja' as CaptionLang,
  story: promoCopy('ja'),
  fontFamily: 'sans-serif',
  /** Frames per beat of the music, for visuals that land on the beat. */
  perBeat: 15,
});

export const usePromo = () => useContext(PromoContext);

/** Scene timing props and localized copy always come from the same provider. */
export function usePromoScene<Props>(scene: {
  readonly spec: { readonly props: Props };
}) {
  return { ...usePromo(), props: scene.spec.props };
}
