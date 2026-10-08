import { tokens } from '@zapengine/design-tokens/tokens';
import type { CSSProperties } from 'react';
import { Easing } from 'remotion';

export const palette = tokens.mode;
export const color = palette.night;
export const sleeve = tokens.sleeve.night;
export const assetColor = {
  BTC: sleeve.btc,
  ETH: sleeve.eth,
  SPY: sleeve.spy,
  Stable: sleeve.stable,
};
export type Asset = keyof typeof assetColor;
export const easeScene = Easing.bezier(...tokens.easing.scene);
export const hairline = `${tokens.line.hair}px solid ${color.rule}`;
export function typeStyle(role: keyof typeof tokens.type): CSSProperties {
  const type = tokens.type[role];
  return {
    fontFamily: tokens.font[type.family].web,
    fontSize: type.size,
    lineHeight: `${type.line}px`,
    letterSpacing: `${type.tracking}em`,
    fontWeight: type.weight,
    fontVariationSettings: `"wdth" ${type.width}, "wght" ${type.weight}`,
    textTransform: type.case === 'uppercase' ? 'uppercase' : 'none',
    fontVariantNumeric: type.numeric,
  };
}
