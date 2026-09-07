/**
 * Binds app-core's handled-error seam to Sentry.
 *
 * Registers on import, like `configureSentry`: `entrypoint.js` loads it before
 * expo-router evaluates the route tree, so the queries that a first render
 * kicks off already have somewhere to report to.
 *
 * With no DSN (dev, e2e) `Sentry.init` never ran and `captureException` has no
 * client to send to, so this whole path is inert rather than broken.
 */
import * as Sentry from '@sentry/react-native';
import { setErrorReporter } from '@zapengine/app-core/lib/observability/errorReporter';

import { buildHandledErrorReport } from './queryErrorReporting';

setErrorReporter((error, context) => {
  const report = buildHandledErrorReport(error, context);
  if (!report) {
    return;
  }

  Sentry.captureException(report.error, {
    tags: { handled_scope: report.scope },
    extra: report.extra,
  });
});
