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
});

export type ControlCenterConfig = z.infer<typeof schema>;

export function readControlCenterConfig(
  env: NodeJS.ProcessEnv = process.env,
): ControlCenterConfig {
  return schema.parse(env);
}
