# Video BGM tracks

Background music beds mixed under the narration of vertical news videos. The
renderer resolves tracks by ID (`bgm-01` … `bgm-03`, see
`src/services/video/runtime-assets.ts`); `pickBgmTrack(episodeId)` keeps the
same track across an episode's three locale renders. Tracks loop via ffmpeg
`-stream_loop` and are ducked under narration with `sidechaincompress`, so
mid-track loop seams are masked by the low mix level.

## Current tracks

| Track | Source | License | Added |
| --- | --- | --- | --- |
| `bgm-01.mp3` | Synthesized in-repo with ffmpeg `aevalsrc` (A-minor ambient pad, 32 s) | Original work — no third-party rights | 2026-07-23 |
| `bgm-02.mp3` | Synthesized in-repo with ffmpeg `aevalsrc` (D-major airy pad, 32 s) | Original work — no third-party rights | 2026-07-23 |
| `bgm-03.mp3` | Synthesized in-repo with ffmpeg `aevalsrc` (low pulse bed, 32 s) | Original work — no third-party rights | 2026-07-23 |

The synthesized beds are deliberate placeholders: unambiguous licensing so the
pipeline ships end-to-end. Replace them with curated production music when
ready.

## Swapping in production music

1. Pick tracks from a license-clean library (e.g. Pixabay Music —
   <https://pixabay.com/music/> — free for commercial use, no attribution).
2. Overwrite `bgm-01.mp3` / `bgm-02.mp3` / `bgm-03.mp3` in place — the track
   IDs are the contract; no code change is needed. Prefer 60–120 s loops
   mastered near −16 LUFS (the mix applies its own gain, default −21 dB).
3. Update the table above with the track title, source URL, license line, and
   download date. Do not add tracks whose license cannot be stated here —
   never copy the "grab it from YouTube" approach some generators use.
