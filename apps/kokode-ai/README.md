# KOKODE

Independent Vite + Vanilla TypeScript product in the ZapEngine monorepo.
Source snapshot: i-xtsu-sixyou-ken-mei/kokode-ai at
003a6d9849c3f8641826ef88f812c66ffd8a3d37 (2026-10-04).
The original repository remains the authorship/history reference. Production
now runs from this monorepo on GitHub Pages; branding and domain remain https://www.kokode.xyz/.
See [deployment and migration records](docs/deployment.md).

From the repository root:

```sh
pnpm install
pnpm turbo run dev --filter=@zapengine/kokode-ai
pnpm turbo run test type-check build --filter=@zapengine/kokode-ai
pnpm --filter @zapengine/kokode-ai dev:live
pnpm --filter @zapengine/kokode-ai ops check
```

## Pages and copy

| Path                      | What                                          |
| ------------------------- | --------------------------------------------- |
| `/`                       | Landing page with the pilot form (`#contact`) |
| `/pitch/`                 | Deck for doctors, 14 slides, noindex          |
| `/pitch/partner/`         | Deck for sales partners, 15 slides, noindex   |
| `/og/{ja,en,zh-Hant}.png` | Localized 1200×630 sharing cards              |
| `/privacy.html`           | Privacy policy, hand-written                  |

Each of the first three pages is prerendered in Japanese (the paths above),
English (`/en/…`) and Traditional Chinese (`/zh/…`, `zh-Hant`). Language
links point to the same surface; canonical and hreflang tags cover all three.
English and Traditional Chinese copy is a draft awaiting native-speaker review.
The privacy policy remains Japanese, with its language marked beside links.

Every word on the first three, and in the apps/video `kokode-clinic` film,
comes from `packages/kokode-story/src/` (beats, the four sequences in `narrative.ts`, demos,
disclaimers, form, meta). A Vite plugin (`src/site/plugin.ts`) replaces the
`<!--kokode:<page>:<head|body>-->` markers in the HTML shells at build and dev
time, choosing the locale from the shell’s `<html lang>`; the dev server restarts when a story file changes. Tests fence the
claims in each language (`packages/kokode-story/src/story.test.ts`) and the rendered structure
(`src/site/site.test.ts`).

`packages/kokode-story/src/ja/`, `en/` and `zh-Hant/` share the same copy contracts.
`storyFor(locale)` supplies the renderers; the barrel’s named exports remain
Japanese for the film, whose Japanese captions and English narration are unchanged.
Browser scripts import only the localized form copy. Interest option text is
localized, but submitted values always use the Japanese labels.

The decks page with arrow keys, PageUp/PageDown, Space, Home and End, and
keep the slide in the URL hash. Their contact links carry
`utm_source=pitch&utm_medium=deck&utm_campaign=<deck>` (partner deck also
`interest=partner`), which the lead stores through `getAttribution()`.

```sh
pnpm --filter @zapengine/kokode-ai pitch:pdf
```

builds the site and writes six PDFs: `output/kokode-pitch.<locale>.pdf` and
`output/kokode-pitch-partner.<locale>.pdf`, for `ja`, `en` and `zh-Hant` (one 13.333 x 7.5 in page per slide, links
absolute with `utm_medium=pdf`). It refuses to write when a slide count,
overflow, demo disclaimer or page count check fails. Run it on macOS so the
Japanese text is set in Hiragino.

`pnpm --filter @zapengine/kokode-ai site:smoke` builds and checks all nine
pages at 375px and 1280px, language navigation, same-language deck CTAs,
interest preselection and UTM parameters. It also saves four English/Traditional
Chinese deck contact sheets under `output/smoke/`. After building, run
`node scripts/smoke-site.mjs --dev` from this workspace for the same dev-server check.

Default dev queues leads locally; dev:live writes to production. The browser posts
without keys to genba-lead; only the backend can insert into kokode_ai.leads.
Transient failures stay in genba-ai-lead-queue-v2 and retry on load, online, and
successful submit. Production builds need the public VITE_SUPABASE_URL. Optional
VITE_SALES_EMAIL, VITE_SUPPORT_EMAIL and VITE_ANALYTICS_ENDPOINT configure the site.

Database changes use only root supabase/migrations and the protected main CI
migration job. The four standalone historical migrations are deliberately omitted.
The adoption migration declares the inspected production table idempotently,
preserves data and appends schema exposure. Never apply production DDL locally.
Root supabase/functions/genba-lead owns the function and its handler tests.
The ops script retains checks, function deployment/secrets and API E2E, but has no
SQL/apply entry point. Kokode's own Infisical credentials remain separate.

## Hosting (cut over 2026-10-06)

`zapPilot/zapEngine` GitHub Pages publishes `apps/kokode-ai/dist` through
`.github/workflows/kokode-pages.yml` after canonical main CI succeeds, media
verification passes, and the backend deployment and self-cleaning E2E pass.
Pages uses GitHub Actions, with `www.kokode.xyz` and Enforce HTTPS enabled.
Cloudflare apex/www records point to `zappilot.github.io` in DNS-only mode.
The old repo's custom-domain binding is removed and its `Build and deploy KOKODE`
workflow is disabled; retain that repo for authorship/history.

`kokode-production` is restricted to main and stores the public
`VITE_SUPABASE_URL` variable plus `KOKODE_SUPABASE_ACCESS_TOKEN`, sourced from
Kokode's own Infisical project. The workflow also supports Kokode-specific
universal-auth credentials instead of the token. PR builds use `kokode-preview`,
which contains only public configuration. Build preflight rejects a missing or
invalid Supabase URL so a locally queued form cannot silently ship to production.

Optional public values are `VITE_SALES_EMAIL`, `VITE_SUPPORT_EMAIL`, and
`VITE_ANALYTICS_ENDPOINT`. Do not broaden Zap Pilot's secret identity or put
Kokode credentials into its env registry. Detailed verification, source revision,
and rerun caveats are in [deployment.md](docs/deployment.md).

## Verification and remaining rollout checks

Local workspace lint/type-check/build and all 46 imported tests pass. A fresh
local database replay succeeds; the SQL fixture replays adoption twice and proves
lead preservation, RLS, service grants and unchanged shared exposure. The existing
production endpoint passed the ten API E2E checks; only this run's fixture was
removed. Production inspection found 58 canonical versions with latest
20261003100131, matching the local pre-adoption history. A read-only Management API comparison
confirmed there are no remote-only versions and only 20261004000000 is pending.

The root changed gate currently fails in existing desktop Knip config hints for
@zapengine/types and @zapengine/app-core. Production db push --dry-run is reserved
for protected main CI and has not run from this worktree. CI must confirm only the
new adoption migration is pending, then an empty post-push dry-run. Deployment
ops check --strict requires that adoption version to be recorded. The monorepo site was published on 2026-10-06; post-cutover routes, assets and
lead E2E passed. The old deployment workflow is disabled; see the deployment record.

## Assets and sharing cards

The single copy source and canonical lead flow remain in this workspace. The
former site's hardware imagery is adapted into a scale figure; its branded logo
and sharing card are retired. No GENBA artwork should be served.

| Source asset  | Decision                        | Original SHA-256 (`f1359c1a9^`)                                    |
| ------------- | ------------------------------- | ------------------------------------------------------------------ |
| `studio.webp` | Keep, display at compact size   | `3ebb743b0c11049018f01542ec98c7e1e9b6e88dc348dd48b74db646aab6f371` |
| `rack.webp`   | Restore; display at ≤320 CSS px | `c7ae29c332b466f065cc0a529772844b0b073e35156f6441aacd8680616ed404` |
| `infra.webp`  | Restore, crop and optimize      | `ef1b2e06ab35342d3bfe3b528bef7dff800bc139f05cf8950e5936fd56f6b341` |
| `logo.webp`   | Drop retired branding           | `0a15ecb6797999de6650baf2eb24af645c79379980934a8348ef44d02773c189` |
| `og-card.png` | Replace with localized cards    | `448c348c1abe9d54d48d3114d68eb35edc7ca6a9baf101f9a5b3aef4ffbfbed9` |
| `favicon.svg` | Keep canonical vector symbol    | `09e8bc58051c4cfc1f961594d790508d4d8bc7876fd6e6c6b5b5d2c1debbc896` |

Restore rack/infra with `git show f1359c1a9^:apps/kokode-ai/assets/<name> > apps/kokode-ai/assets/<name>`.
Infrastructure alpha includes faint noise: Pillow's alpha threshold >16 gives
content bbox `(109, 167, 1147, 1056)`. Decode the original using `dwebp` then run
`cwebp -q 82 -alpha_q 90 -crop 109 167 1038 889 -resize 640 0 original.png -o apps/kokode-ai/assets/infra.webp`.
Studio remains unchanged; the compact rendering limits its visible generation artifacts.
Image provenance/licensing and third-party-like appearance still need owner review.
The larger configurations and ongoing update/support statements need commercial
approval before publication; English/Traditional Chinese additions need native review.

Run `pnpm --filter @zapengine/kokode-ai og:render` on macOS after changing hero
copy, site name/tagline, the favicon or card layout. The generator uses cached
Chromium with Hiragino/PingFang and writes committed PNGs and
`scripts/og.manifest.json`. Tests fail when the exact render input changes.
All nine pages share their language's card, including noindex decks; smoke checks
that each card is available as `image/png`.

HTTPS enforcement and HTTP/apex redirects were verified at cutover. The old
`Build and deploy KOKODE` workflow is disabled so it cannot redeploy the shared
function or reset its CORS secret. Canonical publication remains gated by the
complete main CI run, including unrelated package failures. Production is
restricted to main; post-cutover self-cleaning lead E2E passed.

## Consolidation decisions (2026-10-05)

| Area                           | Final decision                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead capture                   | Keep canonical browser queue, handler, migrations and workflow unchanged; strict production check and ten self-cleaning E2E assertions passed, aggregate count stayed at one.            |
| Hero, clinical demos and pilot | Keep canonical pain → demo → boundary → pilot sequence; add document-search and voice examples to match the form.                                                                        |
| Hardware scale                 | Combine canonical start-small story with three illustrative equipment sizes; no retired SKU names, extra prices or availability promises.                                                |
| Updates and operations         | Partially superseded by the 2026-10-06 product decision: describe USB/offline delivery and facility-managed backups; signed updates, rollback and encryption remain implementation gaps. |
| Pricing and CTA                | Keep one PoC price and consultation CTA; clarify English task ownership and select-based form wording.                                                                                   |
| SEO and sharing                | Add on-premises descriptions and localized cards generated only from story copy; retire GENBA artwork.                                                                                   |

Verification: Kokode 157 tests and video 223 tests passed, with type checks,
build, formatting, nine-page mobile/desktop smoke, all six PDF overflow checks
and the nonempty changed gate (nine tasks). The adoption SQL fixture was not run
in this session because local Docker is unavailable; production schema checks
and lead E2E are separate evidence, not a substitute for migration replay.

Deferred concerns: form facility-size signal, mDNS across VLANs, native review,
lead idempotency/rate limits/body limits, queue bounds/storage errors, unused
honeypot, locale/page-URL persistence and privacy-policy alignment. These are
outside this editorial consolidation; do not broaden CORS for HTTP instead of
enforcing HTTPS. Provision deployment credentials, move Pages/domain ownership,
validate the first release and then freeze the old deployment workflow.

## Sales media release

Run from the repository root:

```sh
pnpm sales:render kokode
pnpm sales:publish kokode --dry-run
pnpm sales:publish kokode
pnpm --filter @zapengine/kokode-ai media:verify
```

The sales registry supplies the absolute video output directory to the publisher
through `--video-out-dir`; Kokode does not assume a sibling video checkout.
The launcher builds the story and media-release dependencies before publishing.

The publisher runs outside Turbo, loads only Kokode Infisical `prod`, and needs
`KOKODE_MEDIA_R2_ENDPOINT`, `KOKODE_MEDIA_R2_ACCESS_KEY_ID`, and
`KOKODE_MEDIA_R2_SECRET_ACCESS_KEY`. Create `kokode-media-publisher` with Object
Read & Write scoped only to `kokode-media`; never store these in Zap Pilot,
the shared env registry, or GitHub secrets. Endpoint:
`https://1352ed9cb1e236fe232f67ff3a8e9850.r2.cloudflarestorage.com`.

R2 bucket `kokode-media` is APAC. `media.kokode.xyz` uses TLS ≥1.2; r2.dev stays
disabled. CORS allows GET/HEAD from Kokode apex/www and the Range header.
Artifacts use immutable `releases/<UTC timestamp>-<random suffix>/` keys,
SHA-256 metadata and upload checksums. PDFs return attachment disposition.
The manifest is replaced atomically only after every public object passes
HEAD, MP4 Range, and full download checksum verification. Failed uploads may
leave unreferenced immutable objects, never a partially published manifest.

Only `src/media/published.ts` supplies website URLs. Missing releases hide the
player during initial build, but tests reject incomplete or stale manifests.
`--only film.ja,poster.ja` limits uploads while still requiring a complete
current manifest. A valid newer local render with changed bytes uploads;
a current publication otherwise stays in place. Repeating publication with
unchanged local artifacts retains URLs. A 412 upload response is accepted only
when the existing SHA metadata matches (unit-tested; verify live on first release).

Film/poster fingerprints cover the pure `filmStory(locale)` projection;
deck fingerprints cover the title and slide HTML. Landing form/nav copy does
not trigger a rebuild. CSS, timing, audio and visuals require an explicit new
render: they are intentionally outside content fingerprints. PDF sidecars
read the build's fingerprint meta tag; video/poster sidecars come from the
same story projection as the renderer. Sidecars are removed before rendering.

The monorepo GitHub Pages site serves www.kokode.xyz after the 2026-10-06 cutover.
R2 media is public immediately; landing changes reach production only through the
CI-gated Pages workflow. The ownership/updates story refresh remains on its PR
branch until narration and media publication are complete.
