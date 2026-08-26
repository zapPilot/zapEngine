import { init } from '@sentry/electron/main';
import { app } from 'electron';

import { buildDesktopSentryOptions } from './sentry';
import {
  BAKED_SENTRY_DSN,
  BAKED_SENTRY_RELEASE,
  resolveSentryDsn,
  resolveSentryRelease,
} from './sentryBuildConfig';

const dsn = resolveSentryDsn(
  BAKED_SENTRY_DSN,
  process.env['SENTRY_DESKTOP_DSN'],
);
const release = resolveSentryRelease(
  BAKED_SENTRY_RELEASE,
  process.env['APP_COMMIT_SHA'],
  app.getVersion(),
);

const options = buildDesktopSentryOptions(dsn, release);

if (options) {
  init(options);
}

void import('./main');
