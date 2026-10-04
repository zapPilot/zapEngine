# KOKODE

Independent Vite + Vanilla TypeScript product in the ZapEngine monorepo.
Source snapshot: i-xtsu-sixyou-ken-mei/kokode-ai at
003a6d9849c3f8641826ef88f812c66ffd8a3d37 (2026-10-04).
The original repository remains the authorship/history reference until production
cutover is verified. Branding and domain remain https://www.kokode.xyz/.

From the repository root:

```sh
pnpm install
pnpm turbo run dev --filter=@zapengine/kokode-ai
pnpm turbo run test type-check build --filter=@zapengine/kokode-ai
pnpm --filter @zapengine/kokode-ai dev:live
pnpm --filter @zapengine/kokode-ai ops check
```

## Pages and copy

| Path              | What                                          |
| ----------------- | --------------------------------------------- |
| `/`               | Landing page with the pilot form (`#contact`) |
| `/pitch/`         | Deck for doctors, 12 slides, noindex          |
| `/pitch/partner/` | Deck for sales partners, 13 slides, noindex   |
| `/privacy.html`   | Privacy policy, hand-written                  |

Each of the first three pages is prerendered in Japanese (the paths above),
English (`/en/…`) and Traditional Chinese (`/zh/…`, `zh-Hant`). Language
links point to the same surface; canonical and hreflang tags cover all three.
English and Traditional Chinese copy is a draft awaiting native-speaker review.
The privacy policy remains Japanese, with its language marked beside links.

Every word on the first three, and in the apps/video `kokode-clinic` film,
comes from `src/story/` (beats, the four sequences in `narrative.ts`, demos,
disclaimers, form, meta). A Vite plugin (`src/site/plugin.ts`) replaces the
`<!--kokode:<page>:<head|body>-->` markers in the HTML shells at build and dev
time, choosing the locale from the shell’s `<html lang>`; the dev server restarts when a story file changes. Tests fence the
claims in each language (`src/story/story.test.ts`) and the rendered structure
(`src/site/site.test.ts`).

`src/story/ja/`, `en/` and `zh-Hant/` share the same copy contracts.
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

## Hosting cutover

.github/workflows/kokode-pages.yml validates PRs and releases only after the
canonical CI main run succeeds (including database migrations). A successful
release baseline catches changes missed by failed runs. Kokode source, function,
adoption migration and shared build inputs trigger a release; unrelated product
changes do not. Production E2E must pass before Pages publishes.

Before enabling rollout, configure GitHub Pages for Actions on zapEngine and
transfer the www.kokode.xyz Pages custom-domain binding from the standalone repo.
Use the kokode-production Environment for Kokode-specific credentials and public
variables: VITE*SUPABASE_URL plus optional VITE*\_ values, and either
`KOKODE_SUPABASE_ACCESS_TOKEN` or the two
`KOKODE_INFISICAL_UNIVERSAL_AUTH_CLIENT_ID` and
`KOKODE_INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET` secrets for an
identity authorized to read Kokode's project. Do not broaden the Zap identity.
This workflow does not transfer domain bindings or credentials automatically.
Keep the old repository active until the monorepo site and waitlist are verified.

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
ops check --strict requires that adoption version to be recorded. The monorepo
site has not been published; verify www.kokode.xyz and its waitlist again after
the Pages/Environment cutover before retiring the old repository.
