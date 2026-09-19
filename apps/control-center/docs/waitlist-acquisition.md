# Acquisition and community contract

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

Deploy in order: root waitlist migration → account-engine → landing page (first-touch + Discord CTA) and
social publisher → Control Center. Check signup success, exact lead totals and
canonical source attribution, then confirm the Home/Product/Growth statements
agree. Applying the production migration, publishing and sending email are
separate operations from this local integration.

## Discord and per-episode acquisition

`GET /api/growth` and MCP `ops_growth` (server version 0.10.0) return
`journey`, `community`, `lanes`, and `laneSources`. The obsolete
`/api/growth-journey` route is removed. Refresh propagates `force` to both
social-growth and Discord caches. Overall `status` depends only on the journey;
PostHog lanes, social posts, waitlist, and community each degrade independently.

Landing registers `first_touch_utm_source`, `first_touch_utm_medium`,
`first_touch_utm_campaign` (episode UUID), and `first_touch_utm_content` (language)
from the same localStorage record used by the waitlist POST. Missing values are
omitted. Existing stored first touch wins over a later URL. Only events collected
after this instrumentation deploys carry these properties.

Closing, footer, successful waitlist signup, and `/discord/` emit
`discord_cta_clicked { location, target: 'discord', post_waitlist }` through GA and
PostHog. `location` is `closing`, `footer`, `waitlist_success`, or `redirect`.
`post_waitlist: false` means unknown, not evidence of no signup. This event proves
click intent, never membership. The static `/discord/` client hop sends a beacon
before navigating after 600 ms, with an untracked fallback link and noindex metadata.
Hero remains waitlist-only; podcast publishing copy is unchanged.

Journey uses separate ordered one-day funnels for landing → waitlist CTA and
landing → Discord CTA over 30 days. Audience reporting also counts distinct Discord
CTA users and the subset carrying `post_waitlist=true`. App and wallet counts remain
independent observations. Per-lane CTA counts are independent distinct people, not
ordered conversion rates.

Lanes join episode × platform × language across first-touch PostHog rows (30 days,
200-row cap), recent social posts (30 days, 500-row cap), and cumulative waitlist
job conversions. Multiple jobs in one lane sum their signups; newest post metadata
wins. Final rows sort newest first, then platform/language/episode, capped at 60.
Missing language is `unknown`. Rednote has no outbound links and is excluded from
acquisition lanes. `null` means unavailable, while `0` means successfully measured
with no matching activity. Sources can be available with empty rows; an empty or
zero initial view is expected before instrumented traffic accumulates. Mixed
windows and sources must not be divided into a purported conversion rate.

`DISCORD_INVITE_CODE=d3vXUtcFCJ` is public, not a credential. The adapter reads the
Discord public invite endpoint with `with_counts=true`, without Authorization,
with a ten-second deadline and a fifteen-minute cache. `community.memberCount` is
an approximate guild total including existing members: it cannot be attributed to
any episode or acquisition source. An invalid/expired invite is unavailable, not
zero. The nightly sync persists `discord_cta_users_30d`,
`discord_cta_post_waitlist_users_30d`, and `discord_members`; null values are skipped.
No bot, membership identity join, or presence snapshot is introduced.

Deploy landing first, then Control Center with the public invite configured through
the env manifest/destination rail. Verify live invite availability and expiry;
do not assume that a particular member count or invite lifetime remains constant.
