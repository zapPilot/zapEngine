import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

import { SocialPublishError } from './publish-error.js';
import type { PublishResult, XPublisher, XPublishInput } from './types.js';

const DEFAULT_COMMAND_TIMEOUT_MS = 130_000;
const OPENCLI_CANDIDATES = [
  '/opt/homebrew/bin/opencli',
  '/usr/local/bin/opencli',
] as const;

let cachedOpenCliBinary: string | null = null;

export function createOpenCliXPublisher(input?: {
  onLog?: (message: string) => void;
}): XPublisher {
  const log = input?.onLog ?? (() => void 0);
  return {
    async publishX(payload) {
      return publishX(payload, log);
    },
  };
}

export async function isXSessionReady(): Promise<boolean> {
  try {
    const raw = await runOpenCli(['twitter', 'whoami', '-f', 'json'], 45_000);
    const row = parseOpenCliJsonRow(raw, 'twitter whoami');
    return row['logged_in'] === true;
  } catch {
    return false;
  }
}

export async function assertXSessionReady(): Promise<void> {
  try {
    const raw = await runOpenCli(['twitter', 'whoami', '-f', 'json'], 45_000);
    const row = parseOpenCliJsonRow(raw, 'twitter whoami');
    if (row['logged_in'] !== true) {
      throw new Error('twitter reported logged_in=false.');
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `OpenCLI twitter session is not ready. Run \`pnpm social:login\` and try again.\n${detail}`,
      { cause: error },
    );
  }
}

export async function runXLogin(): Promise<void> {
  const binary = await resolveOpenCliBinary();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ['twitter', 'login'], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `OpenCLI twitter login terminated by ${signal}.`
            : `OpenCLI twitter login exited with code ${code ?? 'unknown'}.`,
        ),
      );
    });
  });
}

// The episode video is never uploaded here: a non-Premium account caps video at
// 140 seconds and these episodes run for minutes, so X gets the copy plus the
// share URL, whose OG card carries the thumbnail.
async function publishX(
  input: XPublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  log('[x] Publishing copy and episode link');
  return xStep('post', async () => {
    const text = `${input.text.trim()}\n\n${input.episodeUrl}`;
    const raw = await runOpenCli(
      ['twitter', 'post', text, '-f', 'json'],
      DEFAULT_COMMAND_TIMEOUT_MS,
    );
    const row = parseOpenCliJsonRow(raw, 'twitter post');
    const status = row['status'];
    const succeeded =
      status === true ||
      (typeof status === 'string' &&
        /^(?:ok|posted|published|success|succeeded)$/i.test(status.trim()));
    if (!succeeded) {
      const message = stringField(row, 'message') ?? 'unknown status';
      throw new Error(`Twitter post was not confirmed: ${message}`);
    }

    const identity = twitterPostIdentity(row);
    return {
      status: 'published',
      publishedAt: new Date().toISOString(),
      ...identity,
    };
  });
}

async function xStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('x', step, error);
  }
}

function twitterPostIdentity(row: Record<string, unknown>): {
  url?: string;
  postId?: string;
} {
  const rawUrl = stringField(row, 'url');
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      const statusMatch = /\/status\/(\d+)(?:\/|$)/u.exec(url.pathname);
      if (
        url.protocol === 'https:' &&
        (url.hostname === 'x.com' || url.hostname === 'twitter.com') &&
        statusMatch?.[1]
      ) {
        return { url: url.href, postId: statusMatch[1] };
      }
    } catch {
      // Fall back to the returned post id below.
    }
  }

  const id = stringField(row, 'id');
  return id && /^\d+$/.test(id)
    ? { url: `https://x.com/i/status/${id}`, postId: id }
    : {};
}

function parseOpenCliJsonRow(
  raw: string,
  context: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`OpenCLI ${context} returned invalid JSON.`, {
      cause: error,
    });
  }

  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`OpenCLI ${context} returned no result row.`);
  }
  return row as Record<string, unknown>;
}

function stringField(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function runOpenCli(args: string[], timeoutMs: number): Promise<string> {
  const binary = await resolveOpenCliBinary();
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = [stderr.trim(), stdout.trim(), error.message]
            .filter(Boolean)
            .join('\n');
          reject(
            new Error(detail || 'OpenCLI command failed.', { cause: error }),
          );
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function resolveOpenCliBinary(): Promise<string> {
  if (cachedOpenCliBinary) return cachedOpenCliBinary;

  for (const candidate of OPENCLI_CANDIDATES) {
    const exists = await access(candidate)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      cachedOpenCliBinary = candidate;
      return candidate;
    }
  }

  throw new Error(
    `OpenCLI executable not found. Expected one of: ${OPENCLI_CANDIDATES.join(', ')}`,
  );
}
