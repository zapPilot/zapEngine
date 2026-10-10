import type { TextLook } from '../../../primitives/Kinetic';
import type { CaptionLang } from '../../../timeline/types';
import { theme } from '../../kokode-clinic/theme';

/** A heavy headline in the selected script: Latin tracks tighter than CJK. */
export function headline(
  font: string,
  lang: CaptionLang,
  size: number,
  color: string = theme.ink,
): TextLook {
  return {
    font,
    size,
    color,
    weight: 800,
    tracking: lang === 'en' ? -0.035 : -0.01,
    lineHeight: lang === 'en' ? 1.08 : 1.24,
  };
}

/** A supporting line under a headline. */
export function subline(
  font: string,
  size: number,
  color: string = theme.muted,
): TextLook {
  return { font, size, color, weight: 600, tracking: 0.01, lineHeight: 1.3 };
}
