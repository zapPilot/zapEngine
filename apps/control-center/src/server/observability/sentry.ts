import * as Sentry from '@sentry/node';
import { trimToUndefined } from '@zapengine/types/shared';

export interface SentryEnv {
  APP_COMMIT_SHA?: string;
  NODE_ENV?: string;
  SENTRY_CONTROL_CENTER_DSN?: string;
}

export function initSentry(rawEnv: SentryEnv = process.env) {
  const dsn = trimToUndefined(rawEnv.SENTRY_CONTROL_CENTER_DSN);
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: trimToUndefined(rawEnv.NODE_ENV),
    release: trimToUndefined(rawEnv.APP_COMMIT_SHA),
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  });
  return true;
}

export function captureServerException(
  error: unknown,
  context: { method?: string; route?: string } = {},
) {
  Sentry.withScope((scope) => {
    if (context.method) {
      scope.setTag('http.method', context.method);
    }
    if (context.route) {
      scope.setTag('http.route', context.route);
    }
    Sentry.captureException(error);
  });
}
