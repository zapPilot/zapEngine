export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPort(): number {
  const rawPort = process.env['PORT'] ?? '3000';
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return port;
}

export function getTelegramBotToken(): string {
  return getRequiredEnv('PIPELINE_TELEGRAM_BOT_TOKEN');
}

export function getTelegramWebhookSecret(): string {
  return getRequiredEnv('PIPELINE_TELEGRAM_WEBHOOK_SECRET');
}

export function getAllowedTelegramUserIds(): Set<string> {
  const raw = getRequiredEnv('PIPELINE_TELEGRAM_ALLOWED_USER_IDS');
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export type RenderOnDemandConfig =
  | { enabled: true; appName: string; token: string }
  | { enabled: false; reason: string };

/**
 * Gate for the on-demand `render` process group: the worker only exits on an
 * idle queue when the API process can start it again.
 *
 * Both process groups read the same Fly secrets, so evaluating the identical
 * condition on both sides is what guarantees they agree. A worker that stopped
 * itself while the API cannot wake it would strand every queued job.
 */
export function readRenderOnDemandConfig(): RenderOnDemandConfig {
  const flag = process.env['PIPELINE_RENDER_ON_DEMAND']?.trim().toLowerCase();
  if (flag !== '1' && flag !== 'true') {
    return { enabled: false, reason: 'PIPELINE_RENDER_ON_DEMAND is not set' };
  }

  const token = process.env['PIPELINE_FLY_API_TOKEN']?.trim();
  if (!token) {
    return { enabled: false, reason: 'PIPELINE_FLY_API_TOKEN is empty' };
  }

  const appName = process.env['FLY_APP_NAME']?.trim();
  if (!appName) {
    return { enabled: false, reason: 'FLY_APP_NAME is empty' };
  }

  return { enabled: true, appName, token };
}

export function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}
