import type { Plugin } from 'vite';

import { renderPage } from './pages';

/**
 * Renders the story into the HTML entries before Vite processes them, so
 * assets referenced by the generated markup are bundled as usual. The dev
 * server restarts when a story or site file changes (they are config deps).
 */
export function kokodePages(): Plugin {
  return {
    name: 'kokode-pages',
    transformIndexHtml: { order: 'pre', handler: renderPage },
  };
}
