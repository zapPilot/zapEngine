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
const enabled = options !== undefined;

if (options) {
  init(options);
}

/**
 * Whether error reporting is actually on is otherwise invisible: a missing
 * DSN and a code path that never captures look identical from the outside —
 * both are just an empty Sentry project.
 */
console.log(
  `[sentry] ${enabled ? 'enabled' : 'disabled'} environment=${app.isPackaged ? 'production' : 'development'} release=${release ?? 'unknown'}`,
);

void import('./main');
