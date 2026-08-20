import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { toError } from '../lib/errorMessage.js';
import {
  isPlainRecord as isRecord,
  nonemptyString,
} from '../lib/typeGuards.js';
import {
  createSecureState,
  openUrlInBrowser,
  respond,
} from './oauth-loopback.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
export const YOUTUBE_ANALYTICS_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60_000;
const REFRESH_WINDOW_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

export const DEFAULT_YOUTUBE_SESSION_PATH = join(
  homedir(),
  '.zap-pilot',
  'youtube-session.json',
);

export interface YouTubeSession {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

interface YouTubeOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface YouTubeAuthorizationCallbackInput {
  expectedState: string;
  timeoutMs: number;
  onReady: (redirectUri: string) => Promise<void>;
}

export type YouTubeAuthorizationCodeWaiter = (
  input: YouTubeAuthorizationCallbackInput,
) => Promise<{ code: string; redirectUri: string }>;

export interface YouTubeAuthOptions {
  callbackTimeoutMs?: number;
  createState?: () => string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  additionalScopes?: readonly string[];
  now?: () => number;
  openBrowser?: (url: string) => Promise<void>;
  sessionPath?: string;
  waitForAuthorizationCode?: YouTubeAuthorizationCodeWaiter;
}

class YouTubeSessionInvalidError extends Error {}

class YouTubeOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function buildYouTubeAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    (input.scopes ?? [YOUTUBE_UPLOAD_SCOPE]).join(' '),
  );
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', input.state);
  return url.href;
}

export async function readYouTubeSession(input?: {
  sessionPath?: string;
}): Promise<YouTubeSession | null> {
  const path = input?.sessionPath ?? DEFAULT_YOUTUBE_SESSION_PATH;
  const raw = await readFile(path, 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    },
  );
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new YouTubeSessionInvalidError(
      `Invalid YouTube session at ${path}. Run \`pnpm social:login\` to replace it.`,
    );
  }
  return parseStoredSession(parsed, path);
}

export async function writeYouTubeSession(
  session: YouTubeSession,
  input?: { sessionPath?: string },
): Promise<void> {
  const path = input?.sessionPath ?? DEFAULT_YOUTUBE_SESSION_PATH;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const suffix = randomBytes(8).toString('hex');
  const temporaryPath = `${path}.tmp-${process.pid}-${suffix}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(session, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function assertYouTubeSessionReady(
  options: YouTubeAuthOptions = {},
): Promise<YouTubeSession> {
  const sessionPath = options.sessionPath ?? DEFAULT_YOUTUBE_SESSION_PATH;
  const session = await readYouTubeSession({ sessionPath });
  if (!session) {
    throw new YouTubeSessionInvalidError(
      'YouTube is not logged in. Run `pnpm social:login` first.',
    );
  }

  assertRequiredScopes(session.scope, options);

  const now = options.now?.() ?? Date.now();
  if (session.expiresAt - now > REFRESH_WINDOW_MS) return session;

  try {
    return await refreshYouTubeSession(session, options, now);
  } catch (error) {
    if (
      error instanceof YouTubeOAuthError &&
      [400, 401].includes(error.status)
    ) {
      throw new YouTubeSessionInvalidError(
        `The saved YouTube session was rejected: ${error.message}. Run \`pnpm social:login\` to reconnect it.`,
        { cause: error },
      );
    }
    throw error;
  }
}

export async function ensureYouTubeSession(
  options: YouTubeAuthOptions = {},
): Promise<YouTubeSession> {
  try {
    return await assertYouTubeSessionReady(options);
  } catch (error) {
    if (!(error instanceof YouTubeSessionInvalidError)) throw error;
  }

  return authorizeYouTubeSession(options);
}

export async function waitForYouTubeAuthorizationCode(
  input: YouTubeAuthorizationCallbackInput,
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri = '';
    const server = createServer((request, response) => {
      if (!redirectUri) {
        respond(response, 503, 'YouTube authorization callback is not ready.');
        return;
      }

      const requestUrl = new URL(request.url ?? '/', redirectUri);
      if (request.method !== 'GET' || requestUrl.pathname !== '/') {
        respond(response, 404, 'Not found.');
        return;
      }

      const oauthError = requestUrl.searchParams.get('error');
      if (oauthError) {
        respond(response, 400, 'YouTube authorization was denied.');
        finish(new Error(`YouTube OAuth returned ${oauthError}.`));
        return;
      }

      if (requestUrl.searchParams.get('state') !== input.expectedState) {
        respond(response, 400, 'Invalid OAuth state.');
        finish(new Error('YouTube OAuth callback state did not match.'));
        return;
      }

      const code = requestUrl.searchParams.get('code')?.trim();
      if (!code) {
        respond(response, 400, 'Missing authorization code.');
        finish(new Error('YouTube OAuth callback did not include a code.'));
        return;
      }

      respond(
        response,
        200,
        'YouTube connected to Zap Pilot. You can close this tab and return to the terminal.',
      );
      finish(undefined, { code, redirectUri });
    });

    const timer = setTimeout(() => {
      finish(new Error('Timed out waiting for YouTube authorization.'));
    }, input.timeoutMs);

    server.once('error', (error) => finish(error));
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        finish(
          new Error('Could not determine the YouTube OAuth callback port.'),
        );
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}`;
      try {
        await input.onReady(redirectUri);
      } catch (error) {
        finish(toError(error));
      }
    });

    function finish(
      error?: Error,
      result?: { code: string; redirectUri: string },
    ): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('YouTube OAuth callback ended without a result.'));
    }
  });
}

async function authorizeYouTubeSession(
  options: YouTubeAuthOptions,
): Promise<YouTubeSession> {
  const config = readOAuthConfig(options.env ?? process.env);
  const state = (options.createState ?? createSecureState)();
  if (!state.trim()) {
    throw new Error('YouTube OAuth state generation returned an empty value.');
  }

  const waitForCode =
    options.waitForAuthorizationCode ?? waitForYouTubeAuthorizationCode;
  const openBrowser = options.openBrowser ?? openUrlInBrowser;
  const { code, redirectUri } = await waitForCode({
    expectedState: state,
    timeoutMs: options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS,
    onReady: async (callbackUrl) => {
      const authorizationUrl = buildYouTubeAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: callbackUrl,
        state,
        scopes: requiredScopes(options),
      });
      await openBrowser(authorizationUrl);
    },
  });

  const token = await requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    options.fetchImpl ?? fetch,
  );
  if (!token.refreshToken) {
    throw new Error(
      'Google did not return a YouTube refresh token. Revoke the app grant and run `pnpm social:login` again.',
    );
  }

  const now = options.now?.() ?? Date.now();
  const session: YouTubeSession = {
    version: 1,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: now + token.expiresInSeconds * 1_000,
    scope: token.scope ?? requiredScopes(options).join(' '),
  };
  assertRequiredScopes(session.scope, options);
  await writeYouTubeSession(session, { sessionPath: options.sessionPath });
  return session;
}

async function refreshYouTubeSession(
  session: YouTubeSession,
  options: YouTubeAuthOptions,
  now: number,
): Promise<YouTubeSession> {
  const config = readOAuthConfig(options.env ?? process.env);
  const token = await requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
    options.fetchImpl ?? fetch,
  );

  const updated: YouTubeSession = {
    version: 1,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? session.refreshToken,
    expiresAt: now + token.expiresInSeconds * 1_000,
    scope: token.scope ?? session.scope,
  };
  assertRequiredScopes(updated.scope, options);
  await writeYouTubeSession(updated, { sessionPath: options.sessionPath });
  return updated;
}

async function requestToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scope?: string;
}> {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new YouTubeOAuthError(
      describeOAuthError(payload, response.status),
      response.status,
    );
  }
  if (!isRecord(payload)) {
    throw new Error('Google OAuth returned a non-object token response.');
  }

  const accessToken = nonemptyString(payload['access_token']);
  const expiresInSeconds = payload['expires_in'];
  if (!accessToken || !positiveNumber(expiresInSeconds)) {
    throw new Error(
      'Google OAuth token response is missing access_token or expires_in.',
    );
  }

  const refreshToken = nonemptyString(payload['refresh_token']);
  const scope = nonemptyString(payload['scope']);
  return {
    accessToken,
    expiresInSeconds,
    ...(refreshToken ? { refreshToken } : {}),
    ...(scope ? { scope } : {}),
  };
}

function readOAuthConfig(env: NodeJS.ProcessEnv): YouTubeOAuthConfig {
  const clientId = env['YOUTUBE_CLIENT_ID']?.trim();
  const clientSecret = env['YOUTUBE_CLIENT_SECRET']?.trim();
  const missing = [
    !clientId ? 'YOUTUBE_CLIENT_ID' : null,
    !clientSecret ? 'YOUTUBE_CLIENT_SECRET' : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not configured. Create a Google OAuth Desktop client and set the credentials in the repository root .env.`,
    );
  }
  return { clientId: clientId!, clientSecret: clientSecret! };
}

function parseStoredSession(value: unknown, path: string): YouTubeSession {
  if (!isRecord(value)) throw invalidStoredSession(path);
  const version = value['version'];
  const accessToken = nonemptyString(value['accessToken']);
  const refreshToken = nonemptyString(value['refreshToken']);
  const expiresAt = value['expiresAt'];
  const scope = nonemptyString(value['scope']);
  if (
    version !== 1 ||
    !accessToken ||
    !refreshToken ||
    !positiveNumber(expiresAt) ||
    !scope
  ) {
    throw invalidStoredSession(path);
  }
  assertUploadScope(scope);
  return { version: 1, accessToken, refreshToken, expiresAt, scope };
}

function invalidStoredSession(path: string): YouTubeSessionInvalidError {
  return new YouTubeSessionInvalidError(
    `Invalid YouTube session at ${path}. Run \`pnpm social:login\` to replace it.`,
  );
}

function assertUploadScope(scope: string): void {
  const scopes = new Set(scope.split(/\s+/u));
  if (!scopes.has(YOUTUBE_UPLOAD_SCOPE)) {
    throw new YouTubeSessionInvalidError(
      'The YouTube session does not include the youtube.upload scope. Run `pnpm social:login` to reconnect it.',
    );
  }
}

function requiredScopes(options: YouTubeAuthOptions): string[] {
  return [
    ...new Set([YOUTUBE_UPLOAD_SCOPE, ...(options.additionalScopes ?? [])]),
  ];
}

function assertRequiredScopes(
  scope: string,
  options: YouTubeAuthOptions,
): void {
  assertUploadScope(scope);
  const scopes = new Set(scope.split(/\s+/u));
  const missing = requiredScopes(options).filter(
    (required) => !scopes.has(required),
  );
  if (missing.length > 0) {
    throw new YouTubeSessionInvalidError(
      `The YouTube session is missing required scopes: ${missing.join(', ')}. Run \`pnpm social:login\` to reconnect it.`,
    );
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function describeOAuthError(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const description = nonemptyString(payload['error_description']);
    const code = nonemptyString(payload['error']);
    if (description && code)
      return `Google OAuth ${status} ${code}: ${description}`;
    if (description) return `Google OAuth ${status}: ${description}`;
    if (code) return `Google OAuth ${status}: ${code}`;
  }
  return `Google OAuth request failed with HTTP ${status}.`;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
