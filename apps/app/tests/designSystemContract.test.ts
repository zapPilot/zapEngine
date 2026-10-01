import { tokens } from '@zapengine/design-tokens/tokens';
import { expect, it } from 'vitest';
import { APP_FONTS } from '@/lib/fonts';
import { textVariants } from '@/components/ui/textVariants';

it('loads exactly the runtime font families declared by the shared theme', () => {
  expect(Object.keys(APP_FONTS).sort()).toEqual(
    Object.values(tokens.font).sort(),
  );
});
it('defines a literal class map for every shared typography role', () => {
  expect(Object.keys(textVariants).sort()).toEqual(
    Object.keys(tokens.type).sort(),
  );
  for (const [role, classes] of Object.entries(textVariants))
    expect(classes.split(' ')).toContain(`text-${role}`);
});
