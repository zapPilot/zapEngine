import { tokens } from '@zapengine/design-tokens/tokens';
import { expect, it } from 'vitest';

import {
  assetColor,
  color,
  easeScene,
  palette,
  sleeve,
  typeStyle,
} from './tokens';

it('projects canonical night colors and sleeves without host copies', () => {
  expect(color).toEqual(tokens.mode.night);
  expect(palette).toEqual(tokens.mode);
  expect(sleeve).toEqual(tokens.sleeve.night);
  expect(assetColor).toEqual({
    BTC: sleeve.btc,
    ETH: sleeve.eth,
    SPY: sleeve.spy,
    Stable: sleeve.stable,
  });
  expect([easeScene(0), easeScene(1)]).toEqual([0, 1]);
});
it('projects all typography roles including width and label case', () => {
  for (const role of Object.keys(tokens.type) as (keyof typeof tokens.type)[]) {
    const model = typeStyle(role);
    expect(model.fontFamily).toBe(tokens.font[tokens.type[role].family].web);
    expect(model.fontVariationSettings).toContain(
      `"wdth" ${tokens.type[role].width}`,
    );
    expect(model.letterSpacing).toBe(`${tokens.type[role].tracking}em`);
  }
  expect(typeStyle('label').textTransform).toBe('uppercase');
  expect(typeStyle('body').textTransform).toBe('none');
});
