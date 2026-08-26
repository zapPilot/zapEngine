import * as Sentry from '@sentry/node';

export interface SentryEnv {
  APP_COMMIT_SHA?: string;
  NODE_ENV?: string;
  SENTRY_PODCAST_PIPELINE_DSN?: string;
}

function normalize(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function initSentry(rawEnv: SentryEnv = process.env) {
  const dsn = normalize(rawEnv.SENTRY_PODCAST_PIPELINE_DSN);
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: normalize(rawEnv.NODE_ENV),
    release: normalize(rawEnv.APP_COMMIT_SHA),
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
