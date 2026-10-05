# Shared music loops

## Source and terms

Generated through paid OpenRouter using Google Lyria 3 Pro Preview. Model pricing: [$0.08 per song](https://openrouter.ai/google/lyria-3-pro-preview), checked 2026-10-05. No artist, existing song or copyrighted melody was requested.

[OpenRouter terms](https://openrouter.ai/terms) incorporate provider model terms. [Google Gemini API terms](https://ai.google.dev/gemini-api/terms) allow professional/business use and Google does not claim ownership of generated content; similar outputs may be generated for others. These are terms for generated output, not a separately licensed human composition. Commercial use remains subject to applicable provider terms and law. No exclusive copyright, non-infringement guarantee or exclusive license is asserted. The customer must understand these limitations before delivery.

[Google's Lyria model card](https://deepmind.google/models/model-cards/lyria-3/) describes SynthID watermarking. Treat these tracks as AI-generated, SynthID-marked music; this pipeline does not independently detect the watermark. Mastering uses unseeded dynamic loudnorm (LRA target 3), followed by linear alignment to −18 LUFS with −2.5 dBTP encoding headroom to lift quiet passages, then checks the encoded MP3 against −2 dBTP. Natural rests and fades may still fall below the gap audibility target; review the mix evidence before customer delivery.

Full paid sources and their original provenance are preserved in `music/sources/`, outside the Remotion bundle. The free cutter uses one linear gain, without dynamic loudnorm.

`gentle-88.mp3` and `drive-112.mp3` are derived from those sources. Provenance JSON records exact cuts, measured BPM, period/crossfade samples, rate/cents, gain and seam metrics. Review remains pending until human listening.

`pnpm --filter @zapengine/video loop cut <loop-id> --candidates` writes auditions only to `out/loops/`. `cut` selects a clip and sets review pending. Listen to seams, three-cycle beds and rendered films, then `pnpm --filter @zapengine/video loop accept <loop-id>`. `pnpm --filter @zapengine/video music <loop-id> --takes 2` is the separate paid source-generation path; this change calls no paid API.
