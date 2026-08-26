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

/**
 * Optional integer env override with a fallback: anything unparseable or below
 * `min` keeps the default rather than failing, because these knobs are
 * operational tuning, not configuration the service needs to boot.
 */
export function getIntEnv(
  name: string,
  options: { default: number; min: number },
): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return options.default;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= options.min
    ? value
    : options.default;
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

export interface FlyMachinesConfig {
  appName: string;
  token: string;
}

/**
 * What the API process needs to start the `render` machine through the Fly
 * Machines API. `FLY_APP_NAME` is injected by the platform, so its absence
 * means this process is not running on Fly and there is no machine to manage --
 * that is the only case that returns null. On Fly the token is mandatory:
 * missing configuration must fail the boot, never degrade into a deployment
 * mode where nobody starts the render group. Renders stalled silently for two
 * days in August 2026 because a fallback did exactly that.
 */
export function readFlyMachinesConfig(): FlyMachinesConfig | null {
  const appName = process.env['FLY_APP_NAME']?.trim();
  if (!appName) return null;

  return { appName, token: getRequiredEnv('PIPELINE_FLY_API_TOKEN').trim() };
}

export function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}
