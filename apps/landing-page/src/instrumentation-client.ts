import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

const sentryDsn = process.env['NEXT_PUBLIC_SENTRY_DSN']?.trim();
const posthogKey = process.env['NEXT_PUBLIC_POSTHOG_KEY']?.trim();
const posthogHost = process.env['NEXT_PUBLIC_POSTHOG_HOST']?.trim();

const sentryEnabled = Boolean(sentryDsn);
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: undefined,
    sendDefaultPii: false,
  });
}

// This is the only production-live Sentry init in this app: next.config.ts
// sets `output: 'export'`, so sentry.server.config.ts/sentry.edge.config.ts
// never run outside `next build`. A missing DSN and a code path that never
// captures both look like an empty Sentry project from the outside — this
// line turns that into a browser-console check.
// eslint-disable-next-line no-console -- intentional boot-status line, not debug output
console.log(
  `[sentry] ${sentryEnabled ? 'enabled' : 'disabled'} environment=${process.env['NODE_ENV'] ?? 'unknown'} release=unknown`,
);

if (posthogKey) {
  posthog.init(posthogKey, {
    // Docs and pitch pages navigate client-side, so the default `true` would
    // only ever report the first page of a session.
    capture_pageview: 'history_change',
    // Replay is disabled here so a project-side toggle cannot start recording
    // unmasked marketing pages before a masking policy exists.
    disable_session_recording: true,
    respect_dnt: true,
    // Nothing on the marketing site calls `identify`, so the default would mint
    // a person profile for every anonymous visitor. The product app shares this
    // project and does identify, which is what the landing -> app funnel joins on.
    person_profiles: 'identified_only',
    // Omitted rather than defaulted: posthog-js already falls back to the US
    // ingest host, so the value lives only in the env manifest.
    ...(posthogHost ? { api_host: posthogHost } : {}),
  });
  // The product app reports into the same project, so every event needs to say
  // which surface produced it. Registered rather than passed per call so
  // autocaptured `$pageview` carries it too.
  posthog.register({ surface: 'landing' });
}
