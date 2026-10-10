---
name: persuasive-messaging
description: Use for ZapEngine marketing copy, positioning, /pitch decks, promo video packaging and editorial titles; excludes technical docs and functional UI strings.
---

# Persuasive messaging

## Where the copy already lives

- Brand identity: `packages/zap-pilot-story/src/brand/index.ts` is the browser-free canonical source.
- Story copy: `packages/zap-pilot-story/src/copy/beats.ts` owns HERO, stages, chapters and capability chips. Landing scenes render this copy.
- Landing host copy: `apps/landing-page/src/config/messages.ts` (`MESSAGES`) owns metadata, forms, download and retained host surfaces.
- Capability claims: `packages/zap-pilot-story/src/facts/capabilities.ts` (`CAPABILITIES`) records each capability as Live, Research, In development or Planned. Copy references a capability id and pages render its status badge; liveness is never written in prose.
- `apps/landing-page/src/config/__tests__/positioning.test.tsx` fences landing, pitch and docs claims, retired terms and docs links; when it fails, change the copy.
- Pitch: `apps/landing-page/src/config/pitch.ts` and `apps/landing-page/src/app/pitch/`; the cover reuses story `HERO`.
- Promo video: `apps/video/src/videos/<id>/storyboard.ts`; numbers come only from `facts.ts`.
- Kokode (separate medical product): `packages/kokode-story/src/` is the only copy source for its landing, `/pitch/`, `/pitch/partner/` and the `kokode-clinic` film. `packages/kokode-story/src/story.test.ts` fences claims (no absolute, regulatory or medical-device wording outside disclaimers, one price, no revenue-share figures, demos keep their disclaimers); when it fails, change the copy.
- Titles: `apps/podcast-pipeline/prompts/title-system-prompt.txt` (article-grounded generator) and `apps/podcast-pipeline/prompts/title-verification-system-prompt.txt` (independent verifier). Runtime reads those prompts, never this skill; deliberately synchronize packaging changes.
- Budget compression: `apps/podcast-pipeline/prompts/title-compression-system-prompt.txt`, generated, verified and persisted in ingest.
- Budget policy and Rednote measure: `apps/podcast-pipeline/src/social/policy.ts`; stored-variant validation: `apps/podcast-pipeline/src/services/title-variants.ts`. There is no mechanical fitting; a title that cannot fit holds the release.
- Podcast cover and first content scene use the publisher's `og:image`, subject to the existing decorative rejection and fallback rules. Preserve that invariant.
- Shared facts: `packages/zap-pilot-story/src/facts/` owns the recorded contract exports and pinned replay. Rolling landing backtests remain in the host; never use them to silently refresh the film.
- Evidence: `docs/operations/rednote-distribution-diagnosis.md` and Control Center's `ops_growth.packaging` read model.

## Core principle

Lead with one fact-supported desire per message. State the outcome before the
mechanism; use evidence instead of adjectives. Clarity and factual fidelity
outrank persuasion. Earlier free rewrites hid Fomo and Vector behind generic
subjects: preserve named entities and core claims before improving a hook.

## Choose one desire

| Desire           | Core question                                      |
| ---------------- | -------------------------------------------------- |
| Gain             | What useful outcome can I obtain?                  |
| Protection       | What supported loss or risk can I avoid?           |
| Relief           | What effort or friction can disappear?             |
| Curiosity        | What concrete question will this answer?           |
| Belonging        | What identity or community does this connect with? |
| Care and meaning | Who or what that matters benefits?                 |
| Enjoyment        | What is rewarding about the experience itself?     |

## Workflow

1. Follow `Audience → problem/job → primary desire → concrete outcome → mechanism → proof → CTA`.
2. Locate evidence before choosing a desire; titles are grounded in the source title and the full article.
3. Draft one message with an identifiable subject and one primary desire.
4. Check claims, entities, numbers and financial boundaries against the source and article.
5. Verify the changed surface with the commands below.

## Surface rules

### Titles

Best Title is article-grounded and has no character target (4..60 generation guard). The generator reads the source title and the full article and returns a thesis plus 3–5 differently angled candidates, each with at most three short article quotes. A candidate must never be identical to the source after normalization, must convert to Simplified Chinese and must pass the Rednote risk lexicon. Every substantive claim must be supported by the article; an independent verifier (doubt means fail) must also find the subject identifiable and no exaggerated certainty, unsupported causation, prediction or investment promise. Change the angle or sentence structure, preserving all named entities and core claims; never invent superlatives, rankings or characterizations, never move a number away from its owner, turn coordination into either/or, widen a denial's scope or generalize a claim. Never expand a USDT claim into generic crypto. Title and variants precede script; failures stop ingest without a scraped-title fallback.

The first verified candidate that fits Rednote's measure (full-width 1, half-width 0.5, limit 20) is chosen as-is. Otherwise generate a semantically equivalent compression in ingest, re-verify it for thesis, entities, relations and no new claim, and freeze it with title and script. Nothing is truncated: when no candidate compresses, a further round runs and then ingest fails closed. Social never calls a title LLM or derives audience-specific hooks/theses, and a missing variant holds the release. Keep source consequences, contrasts and questions;
never invent them or hide the subject to manufacture suspense.

### Landing

Edit story copy for product claims and shared `MESSAGES` for host copy. Lead with a supported outcome, then the mechanism and
proof; the CTA must describe the next real step.

### Product

Use this workflow for promotional product messaging and positioning.
Functional UI strings remain outside the scope; controls must stay clear.

### Pitch

Use `src/config/pitch.ts` and `/pitch`; preserve the shared story `HERO` cover.
Connect the audience's job to the mechanism and proof without stacking desires.

### Video

Edit the selected storyboard and source every number from `facts.ts`.
Keep cover, title and opening coherent with one thesis across platform lanes.

## Brand identity

- Canonical English slogan: “Your strategy. Your machine. Your wallet.” It headlines the landing hero and pitch cover, home/pitch OG cards, brand lockups and podcast visual/spoken sign-offs. Every slogan screen displays the self-hosting capability marker; `machine.` stays outlined until Live. Never rewrite or translate the slogan; the only other form is the comma-joined spoken sign-off in podcast outros.
- Punchline: “Rules decide. You sign.” It belongs in hero supporting copy and the Sign beat, not the primary headline or exported lockup.
- One-liner comes from `oneLiner()` in the brand module: “Zap Pilot is building a self-hosted runtime for programmable portfolios.” until self-hosting is Live, then “Zap Pilot is a self-hosted runtime for programmable portfolios.” It also leads the hero body, page metadata, pitch description, root README, docs index and YouTube descriptions. Do not turn planned capabilities into present claims.
- Podcast spoken strings are exact versioned literals; parity tests compare their identity with BRAND. Add a new packaging version for a future change, preserving existing audio.
- Social signatures are universal program-owned packaging: X, Threads and YouTube append the English slogan and attributed website URL. Never put it in titles, generate it in editorial bodies, or add it to Rednote. Reserve the real transport budget first; frozen snapshots retain their body and use the original CTA when needed. Spoken “is building” and the visual Planned marker provide the development context for text signatures.

## Financial-promotion boundary

- Never promise returns or give buy/sell, allocation or market-timing advice.
- Backtests do not establish future performance; retain `backtestDisclaimer()` from `apps/landing-page/src/data/backtest-stats.ts`.
- Numbers come only from the committed fixture or the video's `facts.ts`.
- Titles and social copy obey `apps/podcast-pipeline/prompts/social/rednote-risk-rules.md`. A rejected title can hold the entire release cohort; the social writer cannot repair it.
- Preserve attribution and uncertainty for forecasts and strong causal claims.

## Rationalizations — STOP

| Shortcut                                    | Required correction                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Rewrite the one-liner freely.               | Use the status-bound `oneLiner()`; preserve the exact canonical wording.                                   |
| Remove the self-hosting marker.             | Keep it on every slogan screen and outline `machine.` until Live.                                          |
| Zero views prove a weak title.              | Distribution gates are separate; hook_first and direct did not break the observed ceiling.                 |
| Generic entities make room for hooks.       | Preserve the named subject and core claim first.                                                           |
| Mechanically check proper nouns.            | That approach was tried and reverted; assess fidelity against the source without resurrecting a noun gate. |
| Two or three high-view posts prove success. | Require sufficient evidence; report observed association only.                                             |
| Editing this skill changes production.      | Edit the runtime prompt deliberately; deployment activates it.                                             |
| Each platform needs its own hook.           | Use one universal packaging strategy; vary only transport constraints.                                     |
| Stack desires in one title.                 | Choose one source-supported desire.                                                                        |

## Verification

Run from the repository root for title prompt or transport changes:

```bash
pnpm --filter @zapengine/podcast-pipeline exec vitest run src/services/script-system-prompt.strict.test.ts src/services/editorial-title.test.ts src/services/title-variants.test.ts src/services/ingest/script-stage.test.ts src/services/translate.test.ts src/social/compose.test.ts src/social/copy.test.ts src/social/publishers.test.ts src/social/rednote-title-policy.test.ts
pnpm turbo run test lint type-check --filter=@zapengine/podcast-pipeline
node scripts/check-social-release-contract.mjs
pnpm lint config
pnpm dup:check
pnpm exec prettier --check <changed-markdown-files>
```

For landing or promo code, run `pnpm turbo run test lint type-check` with
`--filter=@zapengine/landing-page` or `--filter=@zapengine/video` respectively;
landing changes also run
`pnpm --filter @zapengine/landing-page exec vitest run src/config/__tests__/positioning.test.tsx`.
Group observations by episode `created_at` relative to deployment, because
backlog delays publication. Among distributed Rednote notes compare 24h average
views, best and like rate; report the ≤20-view distribution gate separately.
Track over-budget Best Titles, verifier rejections and rounds from `title_provenance`, and held releases; `truncate` variants are no longer valid.
