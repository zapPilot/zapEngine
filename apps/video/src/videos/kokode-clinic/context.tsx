import { createContext, useContext } from 'react';

import type { CaptionLang } from '../../timeline/types';
import { filmStory } from './story';

export const KokodeContext = createContext({
  lang: 'ja' as CaptionLang,
  story: filmStory('ja'),
  fontFamily: 'sans-serif',
});
export const useKokode = () => useContext(KokodeContext);

/** Scene timing props and localized copy always come from the same provider. */
export function useKokodeScene<Props>(scene: {
  readonly spec: { readonly props: Props };
}) {
  return { ...useKokode(), props: scene.spec.props };
}
