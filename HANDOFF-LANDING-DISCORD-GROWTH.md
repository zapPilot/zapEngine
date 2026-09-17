# HANDOFF — landing Discord acquisition + PostHog growth

## Status
Investigation and implementation plan only. **DO NOT MERGE THIS PR.** No product code has been changed.
Working tree: remote handoff branch only; intended diff is this handoff file.

## Verified facts
- Landing analytics already emits `waitlist_cta_clicked` and `waitlist_submitted`; CTA locations are `hero | navbar | closing`. [verified: apps/landing-page/src/lib/analytics/events.ts:29,40,47]
- The waitlist modal has a distinct successful `joined` state and currently ends after “You’re on the list” / launch-update copy. [verified: apps/landing-page/src/components/landing-v2/AppCtaLink.tsx:41,164-166]
- Hero currently exposes Waitlist + backtest; Closing currently exposes Waitlist + GitHub strategy. [verified: apps/landing-page/src/components/landing-v2/Hero.tsx:37-40] [verified: apps/landing-page/src/components/landing-v2/ClosingCta.tsx:20-28]
- Central links contain GitHub but no Discord URL, and repository search found no Discord invite. [verified: apps/landing-page/src/config/links.ts:11] [verified: GitHub search "discord.gg discord.com/invite Discord" → 0 results]
- Control Center’s ordered PostHog landing funnel is currently `$pageview → waitlist_cta_clicked` with a one-day window. [verified: apps/control-center/src/server/services/operations/posthog.ts:304-305]
- `SocialGrowthJourney` currently has landing/CTA/app/wallet counts but no Discord metric. [verified: apps/control-center/src/shared/growth-journey.ts:11-13]
- Growth review already treats the ordered landing funnel as decision evidence and has an experiment-proposal contract. [verified: .agents/skills/growth/SKILL.md:15,20]

## Inventory
apps/landing-page/src/lib/analytics/events.ts → examined: add canonical Discord click event here.
apps/landing-page/src/components/landing-v2/AppCtaLink.tsx → examined: post-submit success state is the primary Discord placement.
apps/landing-page/src/components/landing-v2/Hero.tsx → examined: leave Hero primary CTA unchanged.
apps/landing-page/src/components/landing-v2/ClosingCta.tsx → examined: candidate secondary Discord CTA.
apps/landing-page/src/config/links.ts → examined: Discord invite belongs in centralized links.
apps/control-center/src/server/services/operations/posthog.ts → examined: extend Growth-only reads/funnel metrics.
apps/control-center/src/shared/growth-journey.ts → examined: extend typed Discord metrics.
apps/control-center/src/client/components/GrowthJourneyPanel.tsx → examined: do not present Supabase waitlist rows and PostHog people as identity-linked.
apps/control-center/src/client/pages/GrowthPage.tsx → examined: leak/experiment presentation can consume Discord intent.
apps/control-center/docs/waitlist-acquisition.md → examined: acquisition contract must document Discord telemetry semantics.
apps/landing-page/src/components/__tests__/AppCtaLink.test.tsx → examined: existing modal/analytics tests are the landing regression seam.
apps/control-center/src/server/services/growth-journey.test.ts → examined: existing ordered-funnel test is the Control Center seam.

## Implementation plan
1. Add `LINKS.social.discord` after the real invite URL is supplied.
2. Add `discord_cta_clicked` with `location: waitlist_success | closing` and `post_waitlist: boolean`; never call it `discord_joined`.
3. Put the primary Discord CTA in the successful waitlist state. Keep Hero focused on email capture; optionally replace Closing’s GitHub secondary CTA with Discord.
4. Extend PostHog Growth reads with unique Discord CTA users and post-waitlist Discord CTA users. Preserve the existing ordered landing→waitlist-intent funnel.
5. Extend `SocialGrowthJourney` / Growth UI without claiming person-level linkage across Supabase waitlist rows and PostHog visitors.
6. Feed the new observed metric into growth-review experiments: CTA copy/prominence, post-waitlist click-through, and source-segmented intent.
7. Update landing + Control Center tests and `waitlist-acquisition.md`.

## Decisions
- Treat Discord as secondary engagement after email capture, not a competing Hero primary CTA.
- Measure `discord_cta_clicked` as intent. A landing-page outbound click cannot prove Discord membership.
- Keep Supabase email signup as durable waitlist truth; PostHog events remain behavioral telemetry.
- Do not add a Discord bot/webhook in this implementation; real member attribution is a separate phase.

## Tests
- AppCtaLink tests: lock success-state Discord CTA and exact analytics payload. mutation: not run.
- Growth journey/PostHog tests: lock new metrics, ordered funnel semantics, and unavailable handling. mutation: not run.

## Gates
- `pnpm --filter <landing-page package> test` → [not run — handoff only]
- Control Center scoped tests → [not run — handoff only]
- format/type-check → [not run — handoff only]

## Scope
Deliberately out: production implementation, Discord bot/member webhook, Discord OAuth, identity joins, deployment, analytics experiment rollout.
Not reached: real Discord member telemetry and a server-side join event.

## Open questions
- What is the canonical Discord invite URL?
- Should Closing replace “Read the strategy” with Discord, or show Discord as an additional secondary action?
- If real join attribution is later required, which Discord bot/webhook owns member events and what identity may legally/safely be joined to PostHog?
