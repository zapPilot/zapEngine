---
name: persuasive-messaging
description: Use for ZapEngine marketing copy, positioning, /pitch decks, promo video packaging, editorial titles and podcast narration scripts; excludes technical docs and functional UI strings.
---

# Persuasive messaging

## Where the copy already lives

- Landing: `apps/landing-page/src/config/messages.ts` (`MESSAGES`).
- Pitch: `apps/landing-page/src/config/pitch.ts` and `apps/landing-page/src/app/pitch/`; the cover reuses `MESSAGES.hero`.
- Promo video: `apps/video/src/videos/<id>/storyboard.ts`; numbers come only from `facts.ts`.
- Kokode (separate medical product): `apps/kokode-ai/src/story/` is the only copy source for its landing, `/pitch/`, `/pitch/partner/` and the `kokode-clinic` film. `src/story/story.test.ts` fences claims (no absolute, regulatory or medical-device wording outside disclaimers, one price, no revenue-share figures, demos keep their disclaimers); when it fails, change the copy.
- Titles: `apps/podcast-pipeline/prompts/title-system-prompt.txt`. Runtime reads that prompt, never this skill; deliberately synchronize packaging changes.
- Budget compression: `apps/podcast-pipeline/prompts/title-compression-system-prompt.txt`, generated and persisted in ingest.
- Narration: `apps/podcast-pipeline/prompts/script-system-prompt.txt`, read only by `generateScriptWithLLM`; `src/services/podcast-packaging.ts` owns the intro and the Zap Pilot outro.
- Budget policy: `apps/podcast-pipeline/src/social/policy.ts`; deterministic fitting: `apps/podcast-pipeline/src/services/title-variants.ts`.
- Podcast cover and first content scene use the publisher's `og:image`, subject to the existing decorative rejection and fallback rules. Preserve that invariant.
- Evidence: `docs/operations/rednote-distribution-diagnosis.md` and Control Center's `ops_growth.packaging` read model.

## Core principle

Lead with one fact-supported desire per message. State the outcome before the
mechanism; use evidence instead of adjectives. Clarity and factual fidelity
outrank persuasion. Earlier free rewrites hid Fomo and Vector behind generic
subjects: preserve named entities and core claims before improving a hook.

Ads, book talks and news narration share one structure: the audience is the hero
with one source-supported desire, the narrator is the guide, a concrete story and
evidence carry the claim, and the ending delivers the promised change of
understanding. Ads aim at a purchase; narration aims at listening on,
understanding and remembering. Runtime prompts carry the structure, never the
word 广告 or a sales register.

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

### Narration scripts

Style reference: 樊登 book talks. The runtime prompt never names him (see the
STOP table); it carries these moves instead:

- Open on a real event that connects to the title, then ask the one question the
  episode answers. No analogy or hypothetical as the first sentence, no program
  talk (这期 / 今天我们来聊聊).
- One spine analogy for the core mechanism (at most three), called back later;
  perspective-taking and guess-then-reveal at most twice; one number at a time
  with its meaning; name the likely misreading, then correct it; a short refrain.
- Describe moves and bans functionally. Quoting a phrase primes it, as an
  example or as a ban: listing 问题来了 as banned raised it from 2 to 7 of 12
  samples. Only compliance terms (炒币黑话, absolutes) are listed verbatim.
- Keep the off-topic register example (the arm without it copied the source
  more on average) and the `verbatim_source` guard below: arms with and without
  the example each produced one word-for-word reading.
- Book-talk style breaks grounding first. Known incident (2026-10-06 A/B): an
  invented Vitalik quote, a shop's profit as yardstick, and a self-computed 97%
  shrink contradicting the source's 75%. Forbid quotes absent from the source,
  any arithmetic the source did not do, numbers or names inside analogies, and
  outside prices or profits.
- The host may react to established facts with the reason, never forecast prices
  or prospects, and never invent experience, identity or contacts.
- Narration ships as subtitles on every platform and feeds the social-copy writer
  (`src/social/copy.ts`), so the financial boundary below applies and 炒币黑话
  or absolutes would resurface in lexicon-gated copy.
- About 3,500 characters at most, a soft cap: long or roundup sources still
  reach about 5,700. Measured 5.4–7.1 characters per second keeps most video
  under Rednote's 15 minutes; the first ~500 characters must stand alone for
  X's 130-second teaser. `assertGeneratedScriptQuality` caps its floor at 1,500
  characters to match.
- Code-coupled: `generatedScriptBodyViolation` (`src/services/llm.ts`) rejects a
  greeting in the first 40 characters and a CTA lead plus action in the last 300
  (还记得/受欢迎/申请 are excluded), and retries a body sharing 90%+ of its
  10-character spans with the source (`verbatim_source`; 11 of 111 production
  narrations before the guard); `buildSubjectCatalogSystemPrompt` keeps analogy
  imagery out of visual anchors.

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
| A book-talk host quotes famous people.      | Narration quotes only what the source attributes; use hypotheticals and analogies instead of anecdotes.    |
| Ad-like narration sells the subject.        | Persuade toward understanding; never promote the subject or give direction.                                |
| More example phrases fix stiffness.         | Listing phrases, even as bans, plants them; describe the move instead.                                     |
| Naming the reference host gives the style.  | The named A/B arm broke explicit bans (白捡钱, analogy opening, program talk); distill the moves.          |
| Paste reference transcripts as few-shots.   | They are copyrighted and leak their content; keep only distilled moves.                                    |

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

For narration prompt changes, A/B the committed prompt against the candidate on
at least four recent articles of different shapes (mechanism, conflict, long and
data-heavy, roundup), two samples each. Run each arm in its own process with
`SCRIPT_PROMPT_PATH` (the prompt is cached per process) and an empty
`LLM_FALLBACK_MODELS`, record the serving model, then check numbers and quotes
against the source, 10-character verbatim overlap, stock-phrase counts and
`findSensitiveTerms` (`src/social/lexicon`) before reading the scripts aloud.

For landing or promo code, run `pnpm turbo run test lint type-check` with
`--filter=@zapengine/landing-page` or `--filter=@zapengine/video` respectively.
Group observations by episode `created_at` relative to deployment, because
backlog delays publication. Among distributed Rednote notes compare 24h average
views, best and like rate; report the ≤20-view distribution gate separately.
Track over-budget Best Titles and the persisted `llm` versus `truncate` variant proportions.
