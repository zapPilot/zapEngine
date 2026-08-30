import { z } from 'zod';

const optionalString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  z.string().optional(),
);

const schema = z.object({
  CONTROL_CENTER_PORT: z.coerce.number().int().min(1).max(65_535).default(4175),
  CONTROL_CENTER_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(15 * 60 * 1000),
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MANAGEMENT_KEY: optionalString,
  OPENROUTER_BASE_URL: optionalString,
  DEBANK_API_KEY: optionalString,
  DEBANK_BASE_URL: optionalString,
  FLY_COST_MODE: z.enum(['manual', 'flyctl']).default('manual'),
  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_DB_SCHEMA: z.string().trim().min(1).default('from_fed_to_chain'),
  // Read-only operational integrations. Every one of these ships dark: an
  // absent credential makes its adapter report `unknown`, never `healthy`,
  // and never sends a request that would be rejected or rate-limited.
  OPS_GITHUB_TOKEN: optionalString,
  FLY_OPS_TOKEN: optionalString,
  SENTRY_OPS_AUTH_TOKEN: optionalString,
  SENTRY_ORG_SLUG: optionalString,
  POSTHOG_PERSONAL_API_KEY: optionalString,
  POSTHOG_PROJECT_ID: optionalString,
  // Remote MCP is independently gated from the dashboard. Provider credentials
  // stay server-side; clients only receive the normalized read model.
  OPS_MCP_TOKEN: optionalString,
});

export type ControlCenterConfig = z.infer<typeof schema>;

export function readControlCenterConfig(
  env: NodeJS.ProcessEnv = process.env,
): ControlCenterConfig {
  return schema.parse(env);
}

export interface CredentialPresence {
  name: string;
  present: boolean;
}

/**
 * Credentials `ops:sync` cannot do its job without.
 *
 * The dashboard degrades per provider on purpose, but the nightly sync has no
 * reader to notice a provider quietly reporting `unconfigured`: it would print
 * a shorter list and exit 0. Every one of these can also go missing without
 * the environment being wrong — turbo runs in strict env mode, so a key absent
 * from `apps/control-center/turbo.json` is stripped before this process starts.
 *
 * `FLY_API_TOKEN` is read from the environment rather than the config schema
 * because it is consumed by the `flyctl` child process, not by this app.
 */
export function checkCostSyncCredentials(
  config: ControlCenterConfig,
  env: NodeJS.ProcessEnv = process.env,
): CredentialPresence[] {
  const presence: CredentialPresence[] = [
    { name: 'SUPABASE_URL', present: Boolean(config.SUPABASE_URL) },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      present: Boolean(config.SUPABASE_SERVICE_ROLE_KEY),
    },
    { name: 'DEBANK_API_KEY', present: Boolean(config.DEBANK_API_KEY) },
    {
      name: 'OPENROUTER_MANAGEMENT_KEY',
      present: Boolean(
        config.OPENROUTER_MANAGEMENT_KEY ?? config.OPENROUTER_API_KEY,
      ),
    },
  ];

  if (config.FLY_COST_MODE === 'flyctl') {
    presence.push({
      name: 'FLY_API_TOKEN',
      present: Boolean(env['FLY_API_TOKEN']?.trim()),
    });
  }

  return presence;
}
