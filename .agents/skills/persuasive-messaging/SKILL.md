---
name: persuasive-messaging
description: Use for ZapEngine marketing copy, positioning, /pitch decks, promo video packaging and editorial titles; excludes technical docs and functional UI strings.
---

# Persuasive messaging

## Where the copy already lives

- Landing: `apps/landing-page/src/config/messages.ts` (`MESSAGES`).
- Pitch: `apps/landing-page/src/config/pitch.ts` and `apps/landing-page/src/app/pitch/`; the cover reuses `MESSAGES.hero`.
- Promo video: `apps/video/src/videos/<id>/storyboard.ts`; numbers come only from `facts.ts`.
- Kokode (separate medical product): `packages/kokode-story/src/` is the only copy source for its landing, `/pitch/`, `/pitch/partner/` and the `kokode-clinic` film. `packages/kokode-story/src/story.test.ts` fences claims (no absolute, regulatory or medical-device wording outside disclaimers, one price, no revenue-share figures, demos keep their disclaimers); when it fails, change the copy.
- Titles: `apps/podcast-pipeline/prompts/title-system-prompt.txt`. Runtime reads that prompt, never this skill; deliberately synchronize packaging changes.
- Budget compression: `apps/podcast-pipeline/prompts/title-compression-system-prompt.txt`, generated and persisted in ingest.
- Budget policy: `apps/podcast-pipeline/src/social/policy.ts`; deterministic fitting: `apps/podcast-pipeline/src/services/title-variants.ts`.
- Podcast cover and first content scene use the publisher's `og:image`, subject to the existing decorative rejection and fallback rules. Preserve that invariant.
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
2. Locate evidence before choosing a desire; titles use only the source title.
3. Draft one message with an identifiable subject and one primary desire.
4. Check claims, entities, numbers and financial boundaries against the source.
5. Verify the changed surface with the commands below.

## Surface rules

### Titles

Best Title has no character target (4..60 generation guard) and may preserve the source verbatim after Simplified Chinese conversion. Preserve entities, core claims and reader perspective. Never expand a USDT claim into generic crypto. Generate semantically equivalent variants in ingest only when a character budget is exceeded; freeze them with title and script. Social never calls a title LLM or derives audience-specific hooks/theses. Keep source consequences, contrasts and questions;
never invent them or hide the subject to manufacture suspense.

### Landing

Edit shared `MESSAGES`. Lead with a supported outcome, then the mechanism and
proof; the CTA must describe the next real step.

### Product

Use this workflow for promotional product messaging and positioning.
Functional UI strings remain outside the scope; controls must stay clear.

### Pitch

Use `src/config/pitch.ts` and `/pitch`; preserve the shared `MESSAGES.hero` cover.
Connect the audience's job to the mechanism and proof without stacking desires.

### Video

Edit the selected storyboard and source every number from `facts.ts`.
Keep cover, title and opening coherent with one thesis across platform lanes.

## Financial-promotion boundary

- Never promise returns or give buy/sell, allocation or market-timing advice.
- Backtests do not establish future performance; retain `backtestDisclaimer()` from `apps/landing-page/src/data/backtest-stats.ts`.
- Numbers come only from the committed fixture or the video's `facts.ts`.
- Titles and social copy obey `apps/podcast-pipeline/prompts/social/rednote-risk-rules.md`. A rejected title can hold the entire release cohort; the social writer cannot repair it.
- Preserve attribution and uncertainty for forecasts and strong causal claims.

## Rationalizations — STOP

| Shortcut                                    | Required correction                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
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
`--filter=@zapengine/landing-page` or `--filter=@zapengine/video` respectively.
Group observations by episode `created_at` relative to deployment, because
backlog delays publication. Among distributed Rednote notes compare 24h average
views, best and like rate; report the ≤20-view distribution gate separately.
Track over-budget Best Titles and the persisted `llm` versus `truncate` variant proportions.
