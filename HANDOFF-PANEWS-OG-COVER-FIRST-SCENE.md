# HANDOFF — PANews OG image as cover + first content scene

## Status
No production code changed. Implement the product rule: for PANews articles, the publisher `og:image` is the preferred source for both the public video thumbnail and the first non-brand/content scene. This intentionally reverses the previous “lead scene must be independently sourced” rule.
Working tree: clean handoff-only branch `handoff/panews-og-cover-first-scene`.

## Verified facts
- The scraper already parses `og:image`, `og:image:url`, `og:image:secure_url`, width/height/alt and tags candidates as `origin: 'openGraph'`. [verified: apps/podcast-pipeline/src/services/scrape.ts:165-255]
- PANews cover selection already chooses the first `origin === 'openGraph'` candidate and converts it to a canonical PNG; missing/failed OG currently falls back to the renderer thumbnail. [verified: apps/podcast-pipeline/src/services/video/panews-cover.ts:79-145]
- The final video result already prefers `coverThumbnailUrl` over the renderer thumbnail. [verified: apps/podcast-pipeline/src/services/episode-video-processor.ts:306-329]
- The visual planner currently does the opposite for the lead content scene: when scene index 0 has named entities it deliberately skips publisher/article images, then searches/reuses instead. [verified: apps/podcast-pipeline/src/services/video/visual-asset-planner.ts:500-537]
- The visual worker already scrapes the article once and passes `article.images` into the planner. [verified: apps/podcast-pipeline/src/services/episode-video-visual-processor.ts:335-406]
- `EPISODE_VIDEO_VISUAL_VERSION` is the cross-app compatibility fence and is currently `podcast-image-visual-plan.v10`; output-contract changes require a bump. [verified: packages/types/src/shared/podcast.ts:120-139]

## Inventory
apps/podcast-pipeline/src/services/scrape.ts  OG extraction → keep, but share one explicit OG-candidate helper if needed
apps/podcast-pipeline/src/services/video/panews-cover.ts  cover OG selection → change only enough to consume the same deterministic candidate contract
apps/podcast-pipeline/src/services/video/visual-asset-planner.ts  lead publisher-image exclusion → change; this is the main reversed invariant
apps/podcast-pipeline/src/services/episode-video-visual-processor.ts  article scrape / planner input → change to identify/pass the lead OG candidate explicitly
apps/podcast-pipeline/src/services/episode-video-processor.ts  final thumbnail preference → largely keep; preserve cover provenance/fallback logging
packages/types/src/shared/podcast.ts  visual compatibility fence → bump v10 → v11
apps/podcast-pipeline/README.md + scoped tests/docs → update the old “independently sourced lead” behavior

## Decisions
- Do not rely on `article.images[0]` ordering. Select the first `origin === 'openGraph'` explicitly and pass/reserve it as the lead candidate.
- “First scene” means the first non-brand/content scene that enters `planVisualAssets`; keep bundled Zap Pilot intro/outro behavior unchanged.
- Lead ladder for PANews should be: explicit OG candidate → existing article/search/reuse/slide fallback. Do not spend Brave budget before trying OG.
- The cover and lead scene must resolve to the same OG source URL. Different derivative bytes/layouts are fine; source identity must match.
- Keep fail-open behavior when OG is missing/unfetchable, but persist/log a specific fallback reason so this is observable rather than silent.
- This is a CTR/product-quality invariant, not a heuristic: publisher-selected preview imagery wins over an independently searched lead image whenever usable.

## Tests
- `scrape.test.ts`: static PANews-like HTML where `og:image` exists in `<head>` but the same image is absent from `<article>`; assert it is extracted as `openGraph`. mutation: not run
- `visual-asset-planner.test.ts` / podcast wrapper test: named lead scene receives the explicit OG candidate and does not call Brave first; scene 2 may consume subsequent article images. mutation: not run
- processor/integration test: cover `sourceImageUrl` and first content-scene asset `originalImageUrl` are the same OG URL. mutation: not run
- version-fence tests: v11 is stamped/claimed/restarted consistently across pipeline and Control Center. mutation: not run

## Gates
- [not run] package tests for `@zapengine/podcast-pipeline`
- [not run] repository lint/typecheck/coverage gates

## Scope
Deliberately out: removing the branded intro/outro; changing Brave budgets/ranking; redesigning later-scene image selection; network tests against live PANews.
Not reached: verify the supplied regression URL `https://www.panewslab.com/zh/articles/01a08aae-91d3-756c-821c-173f833ff964` with a local/manual scrape after implementation and record the extracted OG URL in evidence.

## Traps
- PR #338 introduced the current lead-image exclusion intentionally; do not “fix” only comments/tests while leaving its scene-0 guards in place.
- There are two lead guards today: `tryArticleImage` skips publisher images for scene 0, and searched pool candidates from the publisher are also skipped for scene 0. Remove/replace both consistently for the explicit OG candidate path.
- A visual-version bump can strand/requeue work if claim/restart surfaces do not stamp the same version; follow the shared-version comment and existing parity tests.

## Open questions
- None for product behavior. If exact cover bytes must equal the first-scene stored asset rather than merely share the same OG source URL, confirm before deduplicating the current dedicated PNG cover artifact.