---
name: social-headline
description: >-
  Use when changing social post titles, the headline policy, or the
  prompts/validators behind them in apps/podcast-pipeline; the rules live in
  four places that have drifted apart before.
---

# Social headline policy

## Where the signal already is

`.agents/skills/social-headline/HEADLINE.md` is the **only** editable copy of
the policy. `apps/podcast-pipeline/prompts/social/headline.md` is generated
from it and committed, like `dist/`.

`docs/operations/rednote-distribution-diagnosis.md` holds the measurement this
policy was written against. Read it before proposing a headline change — it
decides which metric the change is allowed to claim.

## Core principle

**Two independent problems, and a title only touches one.**

- 28% of Rednote posts get 0 views. Dead and live posts are indistinguishable
  on hashtag count, title length, publish hour, topic word and position in the
  day, and the distribution is bimodal (0–20, then 80–180). That is a binary
  distribution gate, not a click-through gradient. **No title change fixes it.**
- Every post that *is* distributed lands in the same ~100–130 band and has done
  for six weeks. That ceiling is what copy can move.

A headline change succeeds when `avg live views` / `best` rise. It does **not**
succeed by the dead count falling, and a change justified that way is measuring
the wrong thing.

Related standing rule in `apps/podcast-pipeline/CLAUDE.md`: never answer a
zero-view post by adding its subject to a term list.

## The four places that drift

Changing the policy means touching the canonical file and checking the rest
still agree:

| Place | What belongs there |
| --- | --- |
| `.agents/skills/social-headline/HEADLINE.md` | The whole title policy. Canonical. |
| `prompts/social/rednote.md`, `youtube.md` | Format and platform compliance only — length, hashtags, URLs, Rednote moderation framing. Never title strategy. |
| `prompts/social/editorial.md` | Body-copy rules. Its name rule must stay consistent with the headline policy's subject-vs-source rule; those two contradicted each other before. |
| `src/social/headline-quality.ts` | The executable checks. Prose the model can ignore silently belongs here instead. |

`src/social/copy.ts` holds two more copies by necessity: the hard-coded
`restrictions` string in `buildSystemPrompt`, and
`REDNOTE_TITLE_MAX_CHARACTERS` / `YOUTUBE_TITLE_MAX_CHARACTERS`. Change a limit
in one and the other goes stale with no test failing.

## Fix workflow

1. Edit `HEADLINE.md`. Never edit `prompts/social/headline.md`.
2. `pnpm lint headline-policy --fix` to regenerate, and commit both files.
3. If you moved a rule between files, update the pinning tests —
   `social-title-prompt.strict.test.ts` (canonical policy + platform files
   defer to it), `rednote-title-policy.test.ts` (Rednote compliance, including
   its negative assertions), `copy.test.ts` (the policy reaches the system
   prompt).
4. New rule the model can quietly ignore → add a check in
   `headline-quality.ts` with a test, not another paragraph of prose. Before
   shipping a new check, run it over the published corpus (titles joined to
   `episodes.source_title`) and look at what it rejects. A check is only worth
   having if its rejections are titles you agree are bad — the three attempts
   in `copy.ts` are the whole budget, so a noisy check fails releases.

## Rationalizations — STOP

| Tempting | Why it is wrong |
| --- | --- |
| "Zero-view posts mean the titles are bad." | Measured false. Dead and live are indistinguishable on every authored dimension, and the distribution is bimodal. |
| "Just edit `prompts/social/headline.md`, it is right there." | It is generated. `pnpm lint repo` fails, and the edit is lost on the next `--fix`. |
| "Add the rule to `rednote.md` too, to be safe." | That duplication is what let the four copies contradict each other. One rule, one file. |
| "Loosen the similarity threshold, it rejected a title." | Check first whether the rejection is correct. A shared *named subject* is already masked out; a rejection usually means the clause structure really was reused. Measured over the 66 published titles the current thresholds reject exactly one, and that one is the publisher's clause copied verbatim. Only three attempts exist, so a wrong threshold fails releases — fix the measurement, not the number. |
| "Add a check that every title has a proper noun or a number." | Tried and reverted. A Chinese proper noun has no orthographic marker — 輝達 and 車企 look identical to a matcher — and a digit-or-Latin-or-source-overlap proxy rejected five of 66 published titles including the best-performing post in the corpus (245 views). The rule stays in the prose policy, where a model can apply judgment. |
| "Delete the negative assertions so the test passes." | They exist to stop safety-genericized wording coming back. Update what they point at; never remove one. |
| "Register a second rednote packaging experiment." | `activePackagingExperiment` returns the first match per platform, so a second entry is unreachable. Supersede by replacing. |

## Measuring an experiment

`social_posts.experiment_key` / `experiment_variant` are null for every Rednote
row — `enqueueCohortJobs` never stamps the packaging assignment onto the job.
Join `social_experiment_assignments` on `episode_id` instead; grouping by the
post column returns one null bucket.

## Verification

```bash
pnpm --filter @zapengine/podcast-pipeline test -- src/social
pnpm lint headline-policy
pnpm --filter @zapengine/podcast-pipeline build
```

`pnpm lint repo` is the CI job that runs the drift gate. Prompt files move a
lot of text between files, so run `pnpm dup:check` before handing off — it is
not part of the turbo task set.
