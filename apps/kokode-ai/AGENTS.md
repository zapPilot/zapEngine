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
