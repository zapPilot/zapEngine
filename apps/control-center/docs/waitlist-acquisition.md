# Waitlist acquisition contract

The public marketing acquisition path is:

`social release → attributed landing URL → email waitlist → account-engine → Supabase → Control Center`

This integrates PR #418 (persisted waitlist and social attribution) and PR #419
(PostHog demand reporting). The landing site remains a static export. Direct v2
access remains available for development; marketing CTAs open the waitlist.

## Persistence and attribution

`POST /waitlist` is the bounded public persistence route in account-engine. It
normalizes email before validation, inserts through the existing service-role
client, and uses unique normalized email with ignore-duplicate upsert. Repeated
submissions return success without replacing the original timestamp or source.
The browser captures first-touch path, referrer and UTM in local storage. Storage
failure must not prevent signup. Honeypot submissions do not create records;
per-IP limits remain local to the account-engine process.

The browser supplies bounded UTM fields, never the canonical job identity.
`utm_source` identifies the platform, `utm_medium` is `social`, `utm_campaign`
is the episode UUID and `utm_content` is the language. account-engine resolves
that tuple to `from_fed_to_chain.social_publish_jobs.id`. Unknown attribution
remains direct / unknown. X, Threads and YouTube publishing and published-copy
telemetry use the same destination URL. Rednote retains its no-link CTA contract.

`public.waitlist_signups` has RLS enabled and denies public, anon and authenticated
access. The service role alone reads/writes it. The dashboard reads acquisition
metadata only; email never enters its response or analytics events. No launch
email delivery or CRM automation is included.

## Metrics and presentation

- PostHog runs one 30-day scan per operations snapshot. It counts unique people
  for landing views, landing `waitlist_cta_clicked`, app views and wallet connects,
  with 7/30-day windows plus 7-day landing dead clicks. Legacy `cta_clicked` is
  excluded from waitlist intent. `waitlist_submitted` is diagnostic telemetry,
  never proof of a new persisted lead.
- `SocialGrowthResponse.waitlist` is the typed persisted read model. Exact HEAD
  counts provide total and 7/30-day new signups. Metadata pages use a fixed
  snapshot upper bound and stable created-at/id ordering; collection continues
  across server page limits. Counts, unique row identities and window totals
  must agree before the result is reported as available.
- Release IDs are resolved in bounded batches. Per-release 24h views come from
  collected standardized metrics, including older releases outside the existing
  social-growth query horizon. Missing or zero views produce no ratio.
- Home and Product reuse the cached social-growth response through statements:
  landing traffic, waitlist intent, persisted total/new leads and 7-day social
  versus direct / unknown sources. App and wallet activity is labeled as overall
  observation, not attributed to the waitlist.
- Growth shows cumulative leads per content/platform/language and standardized
  24h views. **Signups / 24h views** compares different time windows; it is not an
  ordered or same-window funnel conversion. No conversion target is invented.

PostHog, persisted waitlist and existing social telemetry degrade independently.
An unavailable waitlist has null counts, not zero. A metrics failure can remove
24h views while preserving signup totals and attribution. A failed or partial
signup read is unavailable and can be retried through the normal refresh/cache
path. Demand telemetry alone does not downgrade Product health.

## Verification and rollout

Regression coverage includes real rendered Home/Product/Growth statements,
first-touch and duplicate email behavior, public-route validation and limiting,
PostHog event agreement, page boundaries beyond 2,000 rows, missing views and
independent source failures. Local integration verification uses isolated
PostgreSQL/PostgREST plus the real route and Control Center services; no production
signup is required.

Deploy in order: root waitlist migration → account-engine → landing page and
social publisher → Control Center. Check signup success, exact lead totals and
canonical source attribution, then confirm the Home/Product/Growth statements
agree. Applying the production migration, publishing and sending email are
separate operations from this local integration.
