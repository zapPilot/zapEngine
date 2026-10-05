See @README.md for the videos, commands and layout.

# Sales refresh (humans)

Normal sales artifact refresh is `pnpm sales:render <product>` from the repo
root (`kokode`, `zap-pilot`): it rebuilds every PDF and video from existing
assets and never calls paid generation APIs. `pnpm sales:publish <product>`
publishes them. The granular workspace commands in the loop below are for
agent/developer media iteration and debugging — run them via
`pnpm --filter @zapengine/video <cmd>` from the repo root, not via root
`video:*` aliases.

# Iteration loop

1. Change copy, narration, cue phrases or scene order in
   `src/videos/<id>/storyboard.ts`; change visuals in `scenes/` or
   `src/primitives/`. Numbers and claims come only from `facts.ts`.
2. Narration changed → `pnpm --filter @zapengine/video voiceover <id>`
   from the repo root. It prints every scene's length and fails over the
   storyboard's `maxSeconds`.
3. Look before you render: `pnpm --filter @zapengine/video stills <id>`, read
   `out/<id>/<lang>/contact-sheet.png`, then single files in `out/<id>/<lang>/stills/`.
4. Render the MP4 only when asked: `pnpm --filter @zapengine/video render <id>`.
   `pnpm --filter @zapengine/video make <id>` refreshes narration before rendering every language;
   it uses the env runner. Music generation remains a separate paid command.

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
- **CJK captions are read, not heard.** `captions: { lang: 'ja', … }`
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
  Japanese or Chinese literal under `src/videos/kokode-clinic/` or `src/primitives/`.
- Captions and screen copy follow `lang` (`ja`, `en`, `zh-Hant`); narration
  is always the story's `en`, so cue phrases are English. Editing an `en` line requires re-synthesising the English narration.
- `fonts.ts` loads only the selected language through the lazy composition in
  `Root.tsx`. Never import it from shared code.
- `theme.ts` mirrors the site's `:root` and `public/brand/kokode-mark.svg` is
  a byte copy of its favicon; the test fails when either drifts.
- No new rendering dependencies (no QR library). The story feeds this workspace's
  type-check and tests (`turbo.json` inputs), but `--affected` cannot see that
  link: after a story edit run this workspace's gate as well.

# Voices

- Advertisement, pitch and sales videos always use a Fish Audio **Fish Official
  English preset** from `src/timeline/voices.ts`. Narration is English except for the sanctioned Japanese brand pronunciation clip.
  Do not use cloned or podcast voices. Choose gender and delivery to fit the
  product: Kokode uses Adrian (calm, reliable male narrator); Zap Pilot's
  calculator pitch uses Hannah (conversational female advertisement voice).
- Before adding a preset, verify its author is Fish Official and its language
  is English, then register its public reference ID in `voices.ts`. Preset IDs
  are data; only `FISH_AUDIO_API_KEY` is secret. Required current configuration: `FISH_AUDIO_ENGINE=s2.1-pro-free`. Every Fish engine must end with `free`; runtime rejects paid engines and never falls back to one. Newer provider-supported free engines may replace the current version when env defaults, runtime defaults and tests are updated together. This applies to narration, brand candidates and auditions; free Fish synthesis does not need payment approval. Human-only `--pick` remains mandatory.

# Subtitle versions

- Captions and all on-screen copy follow the selected language. Versions share
  English narration and scene timing. Caption-only edits do not require TTS;
  spoken English or voice changes do. Kokode outputs Japanese, English and
  Traditional Chinese; translated copy remains a draft pending native review.
- A new language needs `CaptionLang`, split rules, fonts, story copy and tests.
  `render` and `stills` output every available version; `--lang` selects one.

# Generated artifacts

- `out/` and `public/vo/` are ignored. `out/` is a disposable local
  workspace: `render` writes each deliverable to `out/<id>/<id>.<lang>.mp4`
  and deletes its `raw` intermediate on success (a failed render keeps the
  `raw` file for debugging). `vo.manifest.json` stays committed: tests
  and timelines use it. Regenerate narration before rendering a clean checkout.
- TTS is nondeterministic: regenerated durations may differ on another machine.
  Commit the updated manifest together with narration/script changes.

# Music

- Advertisements require genuine arranged instrumental BGM. Storyboards reference a registered loop id and optional base/ducked mix levels. Allow loops cut from real arrangements and played with crossfade overlap. Never use a pulse oscillator as music or silently substitute providers.
- The real-song spike found frame-step crossfade residuals, so this implementation uses the approved fallback: sample-accurate precomputed PCM beds. `prepare-music.ts` runs before Studio, bundling and rendering. Beds are ignored and regenerable; selected short MP3s and provenance JSON stay committed. Full paid originals remain in `music/sources/`, outside the Remotion bundle.
- Source/model/prompt/hash/original commit, cut/BPM/bars, period/crossfade samples, rho, rate/cents, linear gain, seam metrics and review status live in each loop JSON. Keep SynthID and provider terms disclosed in `public/music/README.md`. No exclusive copyright or non-infringement guarantee is asserted. Tell the customer these limits before delivery.
- Free iteration: `pnpm --filter @zapengine/video loop cut <loop-id> --candidates` auditions only in `out/`; `cut` writes the selected clip and sets review pending. `--start`/`--bars` adjust the region. Listen to seam/bed previews and films before explicitly authorizing `pnpm --filter @zapengine/video loop accept <loop-id>`. Never mark accepted from objective metrics alone. `sales:render` fails closed for changed/unaccepted loops; workspace `render` is the development preview path.
- Paid source generation remains separate: `pnpm --filter @zapengine/video music <loop-id> --takes 2`, then free `loop cut --take N`. Shared ledger reserves $0.08 before each attempt, including failures, with a $1 hard cap and at most six takes per invocation. Provider errors stop immediately; never reset the ledger or substitute another model. Do not run generation unless authorized.
- Loops align their period to integer 30fps frames using ≤0.2% rate correction, stay ≤600 kB and cover P+X samples. Master with one linear gain to approximately −18 LUFS / ≤−2 dBTP; no dynamic loudnorm on a loop. CI recomputes encoded seam metrics. Human ears judge instrumentation, vocals and musical quality.
- Preserve existing narration ducking and final mastering (−16 LUFS / ≤−1.5 dBTP). Measure voice/music stems after edits: music at least 12 dB below narration; audible gaps ≥−30 LUFS. Re-render and publish content after accepted music changes even though content fingerprints deliberately exclude audio.

Film source fingerprints come from the same `filmStory` projection the composition reads. Preserve the `out/<id>/` layout; sidecars and posters live beside the MP4.

# Brand pronunciation source assets

- `pnpm --filter @zapengine/video brand-audio kokode --takes 3` generates immutable candidates only. Audition with `--audition`; `--pick N` is human-only and requires an explicit named take. The registry remains candidate until the listening decision.
- Selected `public/brand/audio/*.mp3` and provenance JSON are committed source assets like `public/music`. Voiceover never generates or selects a brand clip; approved assets must match the voice, engine, speed, reference ID and digest.
- Keep English story/caption text unchanged. Splice the approved clip inside one VoLine; never create a separate brand VoLine. Internal edges use splice retention; whole-line mastering keeps its existing 60 ms retention. Punctuation supplies pauses, language switches do not.
