import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

const sentryDsn = process.env['NEXT_PUBLIC_SENTRY_DSN']?.trim();
const posthogKey = process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim();
const posthogHost = process.env['NEXT_PUBLIC_POSTHOG_HOST']?.trim();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: undefined,
    sendDefaultPii: false,
  });
}

if (posthogKey) {
  posthog.init(posthogKey, {
    // Docs and pitch pages navigate client-side, so the default `true` would
    // only ever report the first page of a session.
    capture_pageview: 'history_change',
    // Replay is disabled here so a project-side toggle cannot start recording
    // unmasked marketing pages before a masking policy exists.
    disable_session_recording: true,
    respect_dnt: true,
    // Omitted rather than defaulted: posthog-js already falls back to the US
    // ingest host, so the value lives only in the env manifest.
    ...(posthogHost ? { api_host: posthogHost } : {}),
  });
}
