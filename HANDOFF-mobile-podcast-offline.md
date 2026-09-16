# HANDOFF — mobile podcast offline downloads

## Status
Plan only; no production code has been changed. Implement mobile offline podcast downloads with zero permanent duplicate audio storage in R2, and allow optional offline video by downloading the existing MP4.
Working tree: GitHub branch `docs/mobile-podcast-offline-handoff`; this commit should contain only this handoff.

## Verified facts
- Native playback uses `expo-audio` and loads `episode.hlsUrl` / section `hlsUrl`. [verified: `apps/app/src/integration/podcastPlayer.ts:169-194`]
- One logical episode is main narration plus zero or more classroom HLS sections. [verified: `apps/app/src/integration/podcastSections.ts:1-86`]
- HLS generation transcodes source MP3 to AAC 128 kbps and emits VOD HLS segments. [verified: `apps/podcast-pipeline/src/services/hls.ts:30-72`]
- The source MP3 is intentionally not uploaded as part of the HLS artifact set. [verified: `apps/podcast-pipeline/src/services/hls.ts:30-72`]
- Final videos already exist in R2 as `video.mp4` plus thumbnail/manifest/captions and expose an `mp4Url`. [verified: `apps/podcast-pipeline/src/services/storage.ts:188-225`]
- Native durable podcast metadata already uses device storage adapters; `expo-file-system` is not currently an app dependency. [verified: `apps/app/src/storage/appKeyValueStorage.native.ts:1-7`; `apps/app/package.json:63-110`]

## Decisions
- Mobile offline only. Web remains streaming-only except for no-op/platform adapters needed to keep shared code/builds clean.
- Do not permanently upload a second MP3/M4A beside every HLS asset. R2 remains canonical HLS for audio.
- Add an on-demand audio-download API. The client sends episode/localization + section identity only; the server resolves the DB-owned HLS URL. Never accept an arbitrary source URL from the client.
- For audio download, remux HLS AAC to a temporary single-file M4A with ffmpeg codec-copy when possible; do not decode/re-encode to MP3. Stream the result to the mobile client, then delete server temp files.
- V1 should not cache generated M4A in R2. A short-TTL transient cache is a later optimization only if repeated remux cost becomes material.
- A downloaded localization is complete only when main plus every section returned by `buildPlaybackSections()` has a local file.
- Persist downloaded files under durable app document storage, not cache storage. Persist a small manifest containing an episode snapshot and remote-HLS-to-local-URI mapping.
- Playback resolves downloaded sources to local URIs before entering the existing player. Keep `podcastPlayer.ts` unaware of filesystem/download mechanics if possible.
- Offline cold-start must not depend on React Query feed cache or network login. Complete local downloads must be discoverable and playable from persisted metadata.
- Downloaded queues contain downloaded episodes only so auto-advance cannot fall through to an unavailable remote episode.
- Video download reuses the existing `mp4Url` directly; no server conversion or extra R2 artifact is required.

## Inventory
- `apps/podcast-pipeline/src/index.ts` → add bounded download route(s); server owns URL resolution and response lifecycle.
- `apps/podcast-pipeline/src/services/hls.ts` → inspect/reuse ffmpeg conventions; do not change canonical HLS production unless necessary.
- `apps/podcast-pipeline/src/services/db.ts` / feed response helpers → use existing localization/classroom ownership to resolve requested section safely.
- `apps/app/package.json` → add Expo-compatible filesystem dependency.
- `apps/app/src/storage/**` → add native file adapter + durable download-manifest storage; web unsupported/no-op adapter.
- `apps/app/src/providers/AppProviderShell.tsx` → mount download state above the player.
- `apps/app/src/providers/PodcastPlayerProvider.tsx` → resolve local sources and permit verified local playback without network auth.
- `apps/app/src/screens/PodcastScreen.tsx` → add locally backed Downloads section that survives feed failure.
- `apps/app/src/screens/EpisodeDetailScreen.tsx` → add Download / Downloading / Downloaded / Remove controls and local-snapshot fallback.
- `apps/app/src/components/podcast/EpisodeVideoPlayer.tsx` → verify local MP4 URI support before wiring video downloads. [assumed — not inspected for local-file behavior]

## Tests
- Download route rejects unknown localization/section and never accepts arbitrary remote URLs. mutation: not run
- Audio route remuxes canonical HLS to M4A, cleans temp files on success/failure, and does not write permanent R2 objects. mutation: not run
- Download model marks complete only after main + all classroom files exist; partial failure rolls back incomplete state. mutation: not run
- Cold-start with network unavailable still renders Downloads and plays Story → Classroom transitions from local URIs. mutation: not run
- Downloaded queue auto-advances only among locally available episodes. mutation: not run
- Video download stores existing MP4 locally and plays it offline once local-URI support is verified. mutation: not run

## Gates
- [not run — plan-only PR] `pnpm turbo run type-check lint test build --filter=@zapengine/app`
- [not run — plan-only PR] `pnpm turbo run type-check lint test build --filter=@zapengine/podcast-pipeline`
- [not run — implementation follow-up] real-device: download → force-kill → airplane mode → cold launch → Story → Classroom → lock-screen/seek/next downloaded episode; repeat for video if included.

## Scope
Deliberately out: web/PWA offline, automatic/background bulk download, cross-device sync, offline full-text search, permanent downloadable-audio duplicates in R2.
Not reached: size estimates, storage quota/auto-eviction, short-TTL generated-audio cache, dedicated download-management screen.

## Open questions
- Does the current native video player accept a downloaded `file://` MP4 URI unchanged? Verify before implementing video playback.
- Can the deployed ffmpeg build remux every current audio HLS variant with codec-copy, or is a narrow fallback required for legacy artifacts? Verify against representative old + new episodes before shipping.
