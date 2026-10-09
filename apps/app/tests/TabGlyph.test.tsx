import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TabGlyph } from '@/components/shell/TabGlyph';
import { APP_TAB_NAMES } from '@/integration/navigationModel';
import { palette } from '@/lib/palette';
vi.mock(
  'react-native-svg',
  async () => (await import('./support/svgStub')).svgStub,
);
it('renders a monochrome glyph for each place with the active token color', () => {
  for (const name of APP_TAB_NAMES) {
    expect(renderToStaticMarkup(<TabGlyph name={name} />)).toContain(
      palette['ink-3'],
    );
    expect(renderToStaticMarkup(<TabGlyph name={name} active />)).toContain(
      palette['sign-ink'],
    );
  }
});
