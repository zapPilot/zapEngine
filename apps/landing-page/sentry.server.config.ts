import * as Sentry from '@sentry/nextjs';
import { trimToUndefined } from '@zapengine/types/shared';

const dsn = trimToUndefined(process.env['NEXT_PUBLIC_SENTRY_DSN']);

if (dsn) {
  Sentry.init({
    dsn,
    environment: trimToUndefined(process.env['NODE_ENV']),
    release: undefined,
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  });
}
