import { init } from '@sentry/electron/main';
import { app } from 'electron';

import { buildDesktopSentryOptions } from './sentry';

const options = buildDesktopSentryOptions(
  process.env['SENTRY_DESKTOP_DSN'],
  process.env['APP_COMMIT_SHA'] || app.getVersion(),
);

if (options) {
  init(options);
}

void import('./main');
