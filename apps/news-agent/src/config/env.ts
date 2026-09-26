import { z } from 'zod';

const schema = z.object({
  accountUrl: z.url(),
  podcastUrl: z.url(),
  telegramToken: z.string().min(1).optional(),
  allowedUserIds: z.string().default(''),
});
export type Env = z.infer<typeof schema>;

export function readEnv(): Env {
  return schema.parse({
    accountUrl: process.env['ACCOUNT_API_URL'],
    podcastUrl: process.env['PODCAST_API_URL'],
    telegramToken: process.env['PIPELINE_TELEGRAM_BOT_TOKEN'],
    allowedUserIds: process.env['PIPELINE_TELEGRAM_ALLOWED_USER_IDS'],
  });
}
