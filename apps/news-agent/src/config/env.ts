import { z } from 'zod';

const schema = z.object({
  supabaseUrl: z.url(),
  supabaseKey: z.string().min(1),
  dbSchema: z.literal('from_fed_to_chain').default('from_fed_to_chain'),
  accountUrl: z.url(),
  podcastUrl: z.url(),
  rpcUrl: z.url(),
  model: z.string().min(1),
  openrouterKey: z.string().min(1),
  openrouterUrl: z.url().default('https://openrouter.ai/api/v1'),
  multibaasUrl: z.url().optional(),
  multibaasKey: z.string().min(1).optional(),
  telegramToken: z.string().min(1).optional(),
  allowedUserIds: z.string().default(''),
});

export function readEnv() {
  return schema.parse({
    supabaseUrl: process.env['SUPABASE_URL'],
    supabaseKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    dbSchema: process.env['SUPABASE_DB_SCHEMA'],
    accountUrl: process.env['ACCOUNT_API_URL'],
    podcastUrl: process.env['PODCAST_API_URL'],
    rpcUrl: process.env['RPC_URL_BASE'],
    model: process.env['LLM_MODEL'],
    openrouterKey: process.env['OPENROUTER_API_KEY'],
    openrouterUrl: process.env['OPENROUTER_BASE_URL'],
    multibaasUrl: process.env['MULTIBAAS_BASE_URL'],
    multibaasKey: process.env['MULTIBAAS_API_KEY'],
    telegramToken: process.env['PIPELINE_TELEGRAM_BOT_TOKEN'],
    allowedUserIds: process.env['PIPELINE_TELEGRAM_ALLOWED_USER_IDS'],
  });
}
