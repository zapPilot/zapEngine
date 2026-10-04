See @README.md for the videos, commands and layout.

# Iteration loop

1. Change copy, narration, cue phrases or scene order in
   `src/videos/<id>/storyboard.ts`; change visuals in `scenes/` or
   `src/primitives/`. Numbers and claims come only from `facts.ts`.
2. Narration changed → `node scripts/env/run.mjs -- pnpm --filter @zapengine/video voiceover <id>`
   from the repo root. It prints every scene's length and fails over the
   storyboard's `maxSeconds`.
3. Look before you render: `pnpm --filter @zapengine/video stills <id>`, read
   `out/<id>/contact-sheet.png`, then single files in `out/<id>/stills/`.
4. Render the MP4 only when asked: `pnpm --filter @zapengine/video render <id>`.

# Gotchas

- **Never place a frame number by hand.** Scene lengths come from narration
  (`timeline/timeline.ts`); key visuals to speech with
  `cueFrame(scene, lineId, phrase)` or `cueAt(scene, phrase)`. A cue phrase
  must appear verbatim in exactly one line of its scene, in what is heard:
  `text`, or `say ?? text` when the storyboard's captions are a
  `translation`. Each video's test asserts `unspokenCues(storyboard)` is empty.
- **Edited narration fails the tests until it is re-synthesised.** The
  manifest stores a fingerprint of `say ?? text` plus voice settings;
  `staleLines` must be empty. `text` is the caption, `say` is what the voice
  says when it differs: a pronunciation override (e.g. `CREATE2` →
  `create-two`) or, for translated captions, the narration itself.
- **Japanese captions are read, not heard.** `captions: { lang: 'ja', … }`
  splits and times them by reading units (`timeline/cjk.ts`), and
  `voiceover` (also `--dry-run`) prints each line's reading speed: `dense`
  above 4 units/s, `over limit` above 6. Shorten the caption, not the voice.
- **Compositions are generated from the storyboard on purpose.** Remotion's
  skill favours hand-authored JSX nodes so Studio can write edits back; here
  the storyboard is the single source and Studio is a viewer. Do not inline
  durations into JSX.
- **Captures fail closed.** `shots.ts` checks name the claims each screenshot
  must show (address, verdict, match). A product change that breaks a check
  is the signal to update `facts.ts` and the script, not to loosen the check.
  Cameras follow target names, so a layout change is fixed by re-running
  `capture`.
- **The calculator claim boundary.** The 2025-10-18 recording matches the
  Python backtest; never claim full Python/EVM parity. Quote the move as a
  share (13.75%, the published backtest figure), never in dollars. It is one
  of six rules and proves the contract's math, not the market data.
- **Remotion's bundled ffmpeg is minimal.** It has `loudnorm`,
  `silencedetect`, `atrim`, `libmp3lame` and `aac`, but no `silenceremove`,
  `areverse` or `ebur128`, and it cannot write video to the null muxer: pass
  `-vn` when measuring a rendered MP4. Scripts call it through
  `scripts/lib/media.ts`, never the machine's ffmpeg.
- **Coverage measures the logic, not the pixels.** `vitest.config.ts` pins
  100% on timeline, captions, camera maths, facts, capture checks and the
  narration cache. Scenes are verified by looking at stills.
- **Official Remotion skills are installed per user, not vendored.**
  `remotion-dev/skills` has no license file and the Remotion License does not
  grant redistribution, so the umbrella skill lives in
  `~/.agents/skills/remotion-best-practices` (source commit in its
  `.vendored-from`). Do not run `remotion skills add|update` in this repo: it
  shells out to `npx skills … --yes` in the current directory and can write a
  project copy. Update by replacing that folder from a newer upstream commit.

# Kokode film (`kokode-clinic`)

- Every word comes from `apps/kokode-ai/src/story` through
  `src/videos/kokode-clinic/story.ts`, the only import across the workspace
  boundary. Change copy there, never here: `clinic.test.ts` fails on any
  Japanese literal under `src/videos/kokode-clinic/` or `src/primitives/`.
- Captions are the story's `ja`, narration its `en`, so cue phrases are
  English. Editing an `en` line means paying Fish Audio again.
- `fonts.ts` (Noto Sans JP, about 120 font files) is reached only through the
  lazy composition in `Root.tsx`. Never import it from shared code.
- `theme.ts` mirrors the site's `:root` and `public/brand/kokode-mark.svg` is
  a byte copy of its favicon; the test fails when either drifts.
- No new dependencies (no QR library). The story feeds this workspace's
  type-check and tests (`turbo.json` inputs), but `--affected` cannot see that
  link: after a story edit run this workspace's gate as well.
