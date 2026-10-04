// genba-lead: public lead-capture endpoint for the KOKODE website.
//
// Browser flow (no key at all -- the function is public):
//   POST https://<project>.supabase.co/functions/v1/genba-lead
//   Headers: Content-Type: application/json
// Deployed with `verify_jwt = false` (supabase/config.toml): the gateway's
// JWT check only understands legacy JWT keys, and this endpoint has no
// caller identity to verify anyway.
//
// Server side (never in the repo / browser): the Edge runtime injects
// SUPABASE_URL + SUPABASE_SECRET_KEYS; createAdminClient() uses the
// `default` secret key (else the first one) to insert into kokode_ai.leads
// via PostgREST. `kokode_ai` must be in authenticator's pgrst.db_schemas
// (migration *_expose_kokode_ai_schema.sql); grants restrict the table to
// service_role.
//
// Not `withSupabase`: it eagerly builds a publishable-key client on every
// request (this shared project has no publishable key -> 500) and forces
// `Access-Control-Allow-Origin: *`.
//
// KOKODE_LEAD_ALLOWED_ORIGINS: comma-separated origins (function secrets are
// project-wide and shared with zapEngine, hence the project-specific prefix). Unset = any.
//
// Deploy: `npm run ops -- deploy` (see scripts/supabase-ops.sh).

import { createAdminClient } from 'npm:@supabase/server@1.8.0/core';
import { handleLead, parseAllowedOrigins } from './handler.ts';

const allowedOrigins = parseAllowedOrigins(
  Deno.env.get('KOKODE_LEAD_ALLOWED_ORIGINS'),
);

Deno.serve((req) =>
  handleLead(req, {
    allowedOrigins,
    insertLead: (row) =>
      createAdminClient().schema('kokode_ai').from('leads').insert(row),
  }),
);
