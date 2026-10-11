# Kokode AI

Kokode is a separate product with its own branding, Vite build and release schedule.
Preserve www.kokode.xyz, the public genba-lead slug, kokode_ai schema, and
local-storage queue key genba-ai-lead-queue-v2. Failed transient submissions must
remain queued. Never embed Supabase credentials in the browser.

The only Supabase CLI workdir and migration owner is the repository root.
Do not restore the standalone Management API SQL replay scripts or old migrations.
Function secrets use KOKODE\_ prefixes; deploy only genba-lead, never --prune.
Kokode credentials remain in its own Infisical project; shared coordinates are
read-only from Zap Pilot. Local dev:live submissions reach production.

Run build, type-check and test through Turbo with --filter=@zapengine/kokode-ai.
The workspace tests also cover the canonical root Edge Function handler.

# Copy

All copy lives in `packages/kokode-story/src/`: the landing page, `/pitch/`, `/pitch/partner/`
and the apps/video `kokode-clinic` and `kokode-promo` films render from it, each in the order of
its own sequence in `packages/kokode-story/src/narrative.ts`. `src/site/` only renders.

- Never write copy in `src/site/`, page scripts or the HTML shells;
  `src/site/site.test.ts` fails on Japanese anywhere else.
- A failing guardrail in `packages/kokode-story/src/story.test.ts` means change the copy,
  never widen the guardrail. No revenue-share numbers or wording: the repo is
  public.
- Every demo figure prints its `DEMOS[…].disclaimers`. Keep the `#contact`
  anchor and the ids in `src/dom-ids.ts`.
- A story edit also changes the film; both apps declare `@zapengine/kokode-story`
  as a workspace dependency so Turbo tracks the link. Verify both consumers. Editing
  an English `en` film line means paying to synthesise its narration again.

- After hero copy changes, run `pnpm --filter @zapengine/kokode-ai og:render`;
  `og.test.ts` rejects stale sharing cards. Never reintroduce GENBA artwork.

# Published sales media

Keep the manifest strict: copy changes affecting a film or deck require `pnpm sales:render kokode && pnpm sales:publish kokode`. Never bypass the media test during bootstrap. Website URLs come only from `src/media/published.ts`. Download controls belong after `</main>` on deck pages. Publisher credentials belong only to Kokode Infisical prod and are read only in `scripts/media.ts`. Keep release uploads outside Turbo.
