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

export function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}
