import { BadRequestException } from '@common/http';
import { z } from 'zod';

const portSchema = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANALYTICS_ENGINE_URL: z.string().optional(),
  ALPHA_ETL_URL: z.string().optional(),
  ALPHA_ETL_WEBHOOK_SECRET: z.string().optional(),
  ACCOUNT_ENGINE_PORT: portSchema.optional(),
  PORT: portSchema.optional(),
  NODE_ENV: z.string().default('development'),
  ADMIN_API_KEY: z.string().optional(),
  API_KEY: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_APP_PASSWORD: z.string().optional(),
  NOTIFICATIONS_TEST_RECIPIENT: z.string().optional(),
  ADMIN_NOTIFICATIONS_ENABLED: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_NAME: z.string().optional(),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppEnv extends Omit<RawEnv, 'PORT'> {
  readonly PORT: number;
  readonly server: {
    readonly port: number;
  };
  readonly database: {
    readonly supabase: {
      readonly url: string;
      readonly anonKey: string;
      readonly serviceRoleKey: string;
    };
  };
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new BadRequestException(
      `Configuration validation failed:\n${message}`,
    );
  }

  const env = parsed.data;
  const port = env.ACCOUNT_ENGINE_PORT ?? env.PORT ?? 3004;

  return {
    ...env,
    PORT: port,
    server: {
      port,
    },
    database: {
      supabase: {
        url: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  };
}
