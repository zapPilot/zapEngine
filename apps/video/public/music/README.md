# Advertisement music

Selected MP3s and their provenance JSON are source assets: keep them in Git. Takes and raw responses live in ignored `out/`. Generate with `pnpm music <video-id> --takes 2`; select with `pnpm music <video-id> --pick N`. Never loop a short take.

## Source and terms

Generated through paid OpenRouter using Google Lyria 3 Pro Preview. Model pricing: [$0.08 per song](https://openrouter.ai/google/lyria-3-pro-preview), checked 2026-10-05. No artist, existing song or copyrighted melody was requested.

[OpenRouter terms](https://openrouter.ai/terms) incorporate provider model terms. [Google Gemini API terms](https://ai.google.dev/gemini-api/terms) allow professional/business use and Google does not claim ownership of generated content; similar outputs may be generated for others. These are terms for generated output, not a separately licensed human composition. Commercial use remains subject to applicable provider terms and law. No exclusive copyright, non-infringement guarantee or exclusive license is asserted. The customer must understand these limitations before delivery.

[Google's Lyria model card](https://deepmind.google/models/model-cards/lyria-3/) describes SynthID watermarking. Treat these tracks as AI-generated, SynthID-marked music; this pipeline does not independently detect the watermark. Mastering uses unseeded dynamic loudnorm (LRA target 3), followed by linear alignment to −18 LUFS with −2.5 dBTP encoding headroom to lift quiet passages, then checks the encoded MP3 against −2 dBTP. Natural rests and fades may still fall below the gap audibility target; review the mix evidence before customer delivery.

Objective acceptance: duration ≥ film + 2s, leading silence ≤ 0.3s, measurable non-silent audio, approximately −18 LUFS / true peak ≤ −2 dBTP, 48 kHz stereo MP3 at 192k. Human listening is still required to judge instrumentation, absence of vocals and musical quality.

| File                 | Model                      | Generated (UTC)          | Take | Source                   |
| -------------------- | -------------------------- | ------------------------ | ---- | ------------------------ |
| calculator-pitch.mp3 | google/lyria-3-pro-preview | 2026-10-05T00:57:42.496Z | 1    | Paid OpenRouter / Google |
| kokode-clinic.mp3    | google/lyria-3-pro-preview | 2026-10-05T00:55:13.730Z | 2    | Paid OpenRouter / Google |

## calculator-pitch

SHA-256 (selected mastered MP3): `2b8aaebb0d72419653ddcb51352b7e1f466edc56c1f6bcbdd4440fca405906e2`

Exact prompt:

> Instrumental only, absolutely no vocals, voices, humming or choir. Duration 70 seconds, clean ending. Underscore beneath English narration for a hackathon product pitch. 112 BPM, A minor resolving to C major. Crisp plucked synthesizer arpeggios, tight soft kick, light hi-hats, clean restrained sub bass, bright airy pads. Precise, forward-moving and optimistic. Sparse midrange for intelligible speech, no dominant lead melody. [0:00–0:12] restrained plucked motif; [0:12–0:30] light rhythmic momentum; [0:30–0:50] confident layered progression; [0:50–1:10] optimistic resolution into a clear final chord and clean cadence. No vocals or drops, no risers or cinematic impacts. Begin audible music immediately, no silent intro.

## kokode-clinic

SHA-256 (selected mastered MP3): `662a6f29028e1767b6ade221c768cfd6b07909d550bd05d9a092b4a86fc9cdb4`

Exact prompt:

> Instrumental only, absolutely no vocals, voices, humming or choir. Duration 85 seconds, clean ending. Underscore for a medical technology advertisement beneath English narration. 88 BPM, C major. Soft felt piano arpeggios, warm analog pads, gentle plucked bass, extremely light brushed percussion and fingerpicked pulses entering at 0:14. Sparse 1–4 kHz region for speech, no dominant lead melody. [0:00–0:14] sparse questioning suspenseful chords; [0:14–0:30] pulse enters, hopeful; [0:30–1:05] steady confident gradual layering; [1:05–1:25] warm rising resolution and clean cadence. No drops, risers, heavy bass, distortion, EDM or cinematic impacts. Begin audible music immediately, no silent intro.
