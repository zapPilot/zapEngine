# Listen UI refinement

The Listen screen now has one compact playback surface, a speed trigger with a
dismissible action sheet, 15-second rewind and 30-second forward controls, and
compact media links. Long mixed-language titles use the body font and deliberately
truncate after three lines. Downloads follow the episode library and remain
available during loading, errors, empty feeds, and search.

## State behavior

| State                                                            | Presentation                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Loaded episode matches queue target by localization and language | Player owns playback; the adjacent section only exposes episode order |
| Loaded episode differs from target                               | Player plus a compact, independently accessible resume/start row      |
| No loaded episode, progress exists                               | One-tap resume with remembered position                               |
| No loaded episode, unheard episodes exist                        | One-tap start                                                         |
| All episodes completed                                           | Replay target and latest/oldest ordering remain available             |
| Empty, loading, error, or search                                 | Existing library state and downloaded access remain available         |

The queue selection algorithm is unchanged. The ordering trigger uses the stored
latest/oldest preference. Media links still use
`podcastEpisodeHref(localizationId, languageCode, view)`.

## Zero-clock diagnosis

The native player intentionally masks the public clock during source replacement
to prevent the outgoing source's clock from appearing on the new episode. Saved
progress (for example 93 seconds) is independent of that live clock.

A deterministic regression also exposed a persistent mask: the native hook updates
every 500ms, but the clock fence required the observed position to be within
250ms of the original seek target. Starting at 93 seconds and receiving the first
update at 93.8 seconds left the public clock at zero indefinitely.

After the playback handoff settles, a playing source can now release the fence
when the observed clock agrees with the live source clock and duration. The
paused-target check remains intact. A stale mismatched position still stays
masked. This changes clock presentation only; playback, native transport and
section sequencing are unchanged.

Unknown/non-finite duration displays an em dash and disables the scrubber.
Elapsed time is sanitized independently and is never replaced with remembered
progress or a demonstration clock. The original TestFlight screenshot itself
could not be reproduced on its device; the delayed-status failure was reproduced
with the native hook harness before the fix.

A browser interaction check also reproduced stale relative seeking: after
rewinding from 93 to 78 seconds, an immediate forward press still used the old
93-second UI snapshot and clamped to the end of the 120-second fixture.
Web relative seeking now reads the live audio element's position, so consecutive
-15/+30 actions arrive at 108 seconds before a timeupdate event. A focused
regression pins this behavior.

## Visual evidence

The PNGs are Chromium captures of the exported app at 320×568, 390×844 and
430×844, using a long Chinese/English fixture title, remembered progress at
93 seconds and a generated 120-second silent HLS fixture. Its duration and
position come from the browser's real audio element.

Only the local bundle's authenticated-action boundary was mocked for these
captures; no production source, remote auth, or real account was changed.
Guest playback was separately observed to open the existing sign-in prompt.

- [320px player](listen-320.png)
- [390px player](listen-390.png)
- [430px player](listen-430.png)
- [320px speed sheet](speed-320.png)
- [390px speed sheet](speed-390.png)
- [430px speed sheet](speed-430.png)
- [320px with text doubled](listen-320-text-200.png)
- [Enlarged text after scrolling to the media actions](listen-320-text-200-scrolled.png)

The text-doubled capture is a browser approximation, not iOS Dynamic Type.
Normal-sized captures expose the beginning of the library without scrolling.
Long titles intentionally truncate at large text sizes; the page remains
scrollable.

No original iOS baseline screenshot was supplied, and no simulator was booted.
Before/after iOS screenshots, physical-device Dynamic Type, lock-screen,
earphone and background-playback listening checks remain unverified.

## Verification

All checks below passed. The final unit suite passed 1,669 tests in 212 files;
Android and iOS exports passed, including the iOS bundle boundary check. Browser
checks found no page errors or horizontal overflow, and verified 44px controls,
consecutive seeks, picker dismissal and episode-order changes.

- `pnpm turbo run type-check lint test build --filter=@zapengine/app`
- `pnpm --filter @zapengine/app format:check`
- `pnpm turbo run deadcode dup:check --filter=@zapengine/app`
- Browser checks of resume, play/pause, speed picker and dismissal, long-title
  layout and horizontal overflow at each captured width.

The unit suite includes native/web handoffs, progress hydration and persistence,
section transitions, downloads, media routes, smart queue selection, and the new
same/different/no-target and compact-speed regressions. Native JavaScript export
does not establish physical-device audio behavior.
