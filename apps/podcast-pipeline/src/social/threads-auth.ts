import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  describeThreadsApiError,
  isRecord,
  nonemptyString,
  parseThreadsApiJson,
} from './threads-api.js';

const DEFAULT_API_BASE_URL = 'https://graph.threads.net';
const AUTHORIZE_URL = 'https://www.threads.com/oauth/authorize';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60_000;
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60_000;
const REQUIRED_SCOPES = ['threads_basic', 'threads_content_publish'] as const;

export const DEFAULT_THREADS_SESSION_PATH = join(
  homedir(),
  '.zap-pilot',
  'threads-session.json',
);

export interface ThreadsProfile {
  id: string;
  username: string;
}

export interface ThreadsSession {
  version: 1;
  accessToken: string;
  expiresAt: number;
  userId: string;
  username: string;
}

export interface ReadyThreadsSession {
  session: ThreadsSession;
  profile: ThreadsProfile;
}

interface ThreadsOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  tlsCertPath: string;
  tlsKeyPath: string;
}

export interface ThreadsAuthorizationCallbackInput {
  redirectUri: string;
  expectedState: string;
  tlsCertPath: string;
  tlsKeyPath: string;
  timeoutMs: number;
  onReady: () => Promise<void>;
}

export type ThreadsAuthorizationCodeWaiter = (
  input: ThreadsAuthorizationCallbackInput,
) => Promise<string>;

export interface ThreadsAuthOptions {
  apiBaseUrl?: string;
  callbackTimeoutMs?: number;
  createState?: () => string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  openBrowser?: (url: string) => Promise<void>;
  sessionPath?: string;
  waitForAuthorizationCode?: ThreadsAuthorizationCodeWaiter;
}

interface CallbackRequest {
  method?: string;
  url?: string;
}

interface CallbackResponse {
  end(body?: string): unknown;
  writeHead(status: number, headers: Record<string, string>): unknown;
}

interface CallbackServer {
  readonly listening: boolean;
  close(): unknown;
  listen(port: number, host: string, listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
}

type CallbackServerFactory = (
  options: { cert: Buffer; key: Buffer },
  listener: (request: CallbackRequest, response: CallbackResponse) => void,
) => CallbackServer;

export interface ThreadsCallbackServerOptions extends ThreadsAuthorizationCallbackInput {
  clearTimeoutImpl?: (timer: ReturnType<typeof setTimeout>) => void;
  createServerImpl?: CallbackServerFactory;
  readFileImpl?: (path: string) => Promise<Buffer>;
  setTimeoutImpl?: (
    listener: () => void,
    timeoutMs: number,
  ) => ReturnType<typeof setTimeout>;
}

class ThreadsSessionInvalidError extends Error {}

class ThreadsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function buildThreadsAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', input.state);
  return url.href;
}

export async function readThreadsSession(input?: {
  sessionPath?: string;
}): Promise<ThreadsSession | null> {
  const path = input?.sessionPath ?? DEFAULT_THREADS_SESSION_PATH;
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
    throw new ThreadsSessionInvalidError(
      `Invalid Threads session at ${path}. Run \`pnpm social:login\` to replace it.`,
    );
  }
  return parseStoredSession(parsed, path);
}

export async function writeThreadsSession(
  session: ThreadsSession,
  input?: { sessionPath?: string },
): Promise<void> {
  const path = input?.sessionPath ?? DEFAULT_THREADS_SESSION_PATH;
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });

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

export async function getThreadsProfile(input: {
  accessToken: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<ThreadsProfile> {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error('A Threads access token is required.');
  }

  const value = await requestThreadsJson({
    accessToken,
    apiBaseUrl: input.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    fetchImpl: input.fetchImpl ?? fetch,
    method: 'GET',
    params: { fields: 'id,username' },
    path: '/me',
    secrets: [accessToken],
  });
  return parseProfile(value);
}

export async function assertThreadsSessionReady(
  options: ThreadsAuthOptions = {},
): Promise<ReadyThreadsSession> {
  const path = options.sessionPath ?? DEFAULT_THREADS_SESSION_PATH;
  let session = await readThreadsSession({ sessionPath: path });
  if (!session) {
    throw new ThreadsSessionInvalidError(
      'Threads is not logged in. Run `pnpm social:login` first.',
    );
  }
  const storedSession = session;

  const now = options.now?.() ?? Date.now();
  if (session.expiresAt <= now) {
    throw new ThreadsSessionInvalidError(
      'The Threads session has expired. Run `pnpm social:login` to reconnect it.',
    );
  }

  let validated: Awaited<ReturnType<typeof validateThreadsToken>>;
  try {
    if (session.expiresAt - now <= REFRESH_WINDOW_MS) {
      session = await refreshLongLivedToken(session, options, now);
    }
    validated = await validateThreadsToken(session.accessToken, options, now);
  } catch (error) {
    if (
      error instanceof ThreadsApiError &&
      [400, 401, 403].includes(error.status)
    ) {
      throw new ThreadsSessionInvalidError(
        `The saved Threads session was rejected: ${error.message}. Run \`pnpm social:login\` to reconnect it.`,
        { cause: error },
      );
    }
    throw error;
  }
  const expiresAt = Math.min(session.expiresAt, validated.expiresAt);
  const updated: ThreadsSession = {
    version: 1,
    accessToken: session.accessToken,
    expiresAt,
    userId: validated.profile.id,
    username: validated.profile.username,
  };
  if (!sessionsEqual(storedSession, updated)) {
    await writeThreadsSession(updated, { sessionPath: path });
  }

  return { session: updated, profile: validated.profile };
}

export async function ensureThreadsSession(
  options: ThreadsAuthOptions = {},
): Promise<ReadyThreadsSession> {
  try {
    return await assertThreadsSessionReady(options);
  } catch (error) {
    if (!requiresAuthorization(error)) throw error;
  }

  return authorizeThreadsSession(options);
}

export async function waitForThreadsAuthorizationCode(
  input: ThreadsCallbackServerOptions,
): Promise<string> {
  const redirect = parseRedirectUri(input.redirectUri);
  const readTlsFile = input.readFileImpl ?? ((path) => readFile(path));
  const [cert, key] = await Promise.all([
    readTlsFile(input.tlsCertPath),
    readTlsFile(input.tlsKeyPath),
  ]);
  const createServer =
    input.createServerImpl ??
    ((options, listener) => createHttpsServer(options, listener));
  const setTimer = input.setTimeoutImpl ?? setTimeout;
  const clearTimer = input.clearTimeoutImpl ?? clearTimeout;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: { code: string } | { error: Error }): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimer(timeout);
      if (server.listening) server.close();
      if ('error' in result) reject(result.error);
      else resolve(result.code);
    };

    const notifyReady = async (): Promise<void> => {
      try {
        await input.onReady();
      } catch (error) {
        finish({ error: toError(error) });
      }
    };

    const server = createServer({ cert, key }, (request, response) => {
      if (request.method !== 'GET') {
        respond(response, 405, 'Method not allowed.');
        return;
      }

      const requestUrl = new URL(request.url ?? '/', redirect.origin);
      if (requestUrl.pathname !== redirect.pathname) {
        respond(response, 404, 'Not found.');
        return;
      }

      try {
        const code = parseAuthorizationCallback(
          requestUrl,
          input.expectedState,
        );
        respond(
          response,
          200,
          'Threads login complete. You can close this window.',
        );
        finish({ code });
      } catch (error) {
        const normalized = toError(error);
        respond(response, 400, normalized.message);
        finish({ error: normalized });
      }
    });

    server.once('error', (error) => finish({ error }));
    server.listen(redirect.port, '127.0.0.1', () => {
      timeout = setTimer(
        () =>
          finish({
            error: new Error(
              `Timed out waiting for Threads authorization after ${input.timeoutMs}ms.`,
            ),
          }),
        input.timeoutMs,
      );
      void notifyReady();
    });
  });
}

async function authorizeThreadsSession(
  options: ThreadsAuthOptions,
): Promise<ReadyThreadsSession> {
  const env = options.env ?? process.env;
  const providedToken = env['THREADS_ACCESS_TOKEN']?.trim();
  if (providedToken) {
    return adoptThreadsAccessToken(providedToken, options);
  }

  const config = readOAuthConfig(env);
  const state = (options.createState ?? createSecureState)();
  if (!state.trim()) {
    throw new Error('Threads OAuth state generation returned an empty value.');
  }

  const authorizationUrl = buildThreadsAuthorizationUrl({
    appId: config.appId,
    redirectUri: config.redirectUri,
    state,
  });
  const waitForCode =
    options.waitForAuthorizationCode ?? waitForThreadsAuthorizationCode;
  const openBrowser = options.openBrowser ?? openUrlInBrowser;
  const code = await waitForCode({
    redirectUri: config.redirectUri,
    expectedState: state,
    tlsCertPath: config.tlsCertPath,
    tlsKeyPath: config.tlsKeyPath,
    timeoutMs: options.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS,
    onReady: () => openBrowser(authorizationUrl),
  });

  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now?.() ?? Date.now();
  const shortToken = await exchangeAuthorizationCode({
    apiBaseUrl,
    appId: config.appId,
    appSecret: config.appSecret,
    code,
    fetchImpl,
    redirectUri: config.redirectUri,
  });
  const longToken = await exchangeLongLivedToken({
    accessToken: shortToken,
    apiBaseUrl,
    appSecret: config.appSecret,
    fetchImpl,
  });
  const validated = await validateThreadsToken(
    longToken.accessToken,
    options,
    now,
  );
  return persistValidatedSession({
    accessToken: longToken.accessToken,
    expiresAt: Math.min(
      now + longToken.expiresInSeconds * 1_000,
      validated.expiresAt,
    ),
    options,
    validated,
  });
}

// Threads Tester tokens are issued directly by the App Dashboard, so there is
// no authorization code to exchange and no redirect URI to register.
async function adoptThreadsAccessToken(
  accessToken: string,
  options: ThreadsAuthOptions,
): Promise<ReadyThreadsSession> {
  const now = options.now?.() ?? Date.now();
  const validated = await validateThreadsToken(accessToken, options, now);
  return persistValidatedSession({
    accessToken,
    expiresAt: validated.expiresAt,
    options,
    validated,
  });
}

async function persistValidatedSession(input: {
  accessToken: string;
  expiresAt: number;
  options: ThreadsAuthOptions;
  validated: Awaited<ReturnType<typeof validateThreadsToken>>;
}): Promise<ReadyThreadsSession> {
  const session: ThreadsSession = {
    version: 1,
    accessToken: input.accessToken,
    expiresAt: input.expiresAt,
    userId: input.validated.profile.id,
    username: input.validated.profile.username,
  };
  await writeThreadsSession(session, {
    sessionPath: input.options.sessionPath ?? DEFAULT_THREADS_SESSION_PATH,
  });
  return { session, profile: input.validated.profile };
}

async function refreshLongLivedToken(
  session: ThreadsSession,
  options: ThreadsAuthOptions,
  now: number,
): Promise<ThreadsSession> {
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const value = await requestThreadsJson({
    accessToken: session.accessToken,
    apiBaseUrl,
    fetchImpl: options.fetchImpl ?? fetch,
    method: 'GET',
    params: {
      access_token: session.accessToken,
      grant_type: 'th_refresh_token',
    },
    path: '/refresh_access_token',
    secrets: [session.accessToken],
  });
  const token = parseLongLivedToken(value, 'refresh');
  return {
    ...session,
    accessToken: token.accessToken,
    expiresAt: now + token.expiresInSeconds * 1_000,
  };
}

async function exchangeAuthorizationCode(input: {
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
  code: string;
  fetchImpl: typeof fetch;
  redirectUri: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });
  const value = await requestThreadsJson({
    apiBaseUrl: input.apiBaseUrl,
    body,
    fetchImpl: input.fetchImpl,
    method: 'POST',
    path: '/oauth/access_token',
    secrets: [input.appSecret, input.code],
  });
  if (!isRecord(value) || !nonemptyString(value['access_token'])) {
    throw new Error(
      'Threads API returned an invalid authorization token response.',
    );
  }
  return value['access_token'].trim();
}

async function exchangeLongLivedToken(input: {
  accessToken: string;
  apiBaseUrl: string;
  appSecret: string;
  fetchImpl: typeof fetch;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const value = await requestThreadsJson({
    accessToken: input.accessToken,
    apiBaseUrl: input.apiBaseUrl,
    fetchImpl: input.fetchImpl,
    method: 'GET',
    params: {
      access_token: input.accessToken,
      client_secret: input.appSecret,
      grant_type: 'th_exchange_token',
    },
    path: '/access_token',
    secrets: [input.accessToken, input.appSecret],
  });
  return parseLongLivedToken(value, 'exchange');
}

async function validateThreadsToken(
  accessToken: string,
  options: ThreadsAuthOptions,
  now: number,
): Promise<{ expiresAt: number; profile: ThreadsProfile }> {
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const value = await requestThreadsJson({
    accessToken,
    apiBaseUrl,
    fetchImpl,
    method: 'GET',
    params: { input_token: accessToken },
    path: '/debug_token',
    secrets: [accessToken],
  });
  if (!isRecord(value) || !isRecord(value['data'])) {
    throw new Error('Threads API returned an invalid token debug response.');
  }

  const data = value['data'];
  if (data['is_valid'] !== true) {
    throw new ThreadsSessionInvalidError(
      'The saved Threads access token is invalid. Run `pnpm social:login` to reconnect it.',
    );
  }
  const expiresAtSeconds = data['expires_at'];
  if (
    typeof expiresAtSeconds !== 'number' ||
    !Number.isFinite(expiresAtSeconds) ||
    expiresAtSeconds * 1_000 <= now
  ) {
    throw new ThreadsSessionInvalidError(
      'The saved Threads access token is expired. Run `pnpm social:login` to reconnect it.',
    );
  }
  const scopes = data['scopes'];
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope) => typeof scope === 'string')
  ) {
    throw new Error('Threads API returned an invalid token scope response.');
  }
  const missingScopes = REQUIRED_SCOPES.filter(
    (required) => !scopes.includes(required),
  );
  if (missingScopes.length > 0) {
    throw new ThreadsSessionInvalidError(
      `The saved Threads session is missing required permissions: ${missingScopes.join(', ')}. Run \`pnpm social:login\` to reconnect it.`,
    );
  }

  const profile = await getThreadsProfile({
    accessToken,
    apiBaseUrl,
    fetchImpl,
  });
  return { expiresAt: expiresAtSeconds * 1_000, profile };
}

function parseLongLivedToken(
  value: unknown,
  operation: 'exchange' | 'refresh',
): { accessToken: string; expiresInSeconds: number } {
  if (!isRecord(value)) {
    throw new Error(
      `Threads API returned an invalid long-lived token ${operation} response.`,
    );
  }
  const accessToken = value['access_token'];
  const expiresIn = value['expires_in'];
  if (
    !nonemptyString(accessToken) ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error(
      `Threads API returned an invalid long-lived token ${operation} response.`,
    );
  }
  return {
    accessToken: accessToken.trim(),
    expiresInSeconds: expiresIn,
  };
}

async function requestThreadsJson(input: {
  accessToken?: string;
  apiBaseUrl: string;
  body?: URLSearchParams;
  fetchImpl: typeof fetch;
  method: 'GET' | 'POST';
  params?: Record<string, string>;
  path: string;
  secrets: readonly string[];
}): Promise<unknown> {
  const url = new URL(input.path, input.apiBaseUrl);
  for (const [key, value] of Object.entries(input.params ?? {})) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {};
  if (input.accessToken) {
    headers['Authorization'] = `Bearer ${input.accessToken}`;
  }
  if (input.body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await input.fetchImpl(url, {
    method: input.method,
    headers,
    body: input.body,
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  const value = parseThreadsApiJson(raw);
  if (!response.ok) {
    const detail = describeThreadsApiError(response.status, value);
    throw new ThreadsApiError(
      redactSecrets(detail, input.secrets),
      response.status,
    );
  }
  return value;
}

function readOAuthConfig(env: NodeJS.ProcessEnv): ThreadsOAuthConfig {
  const appId = requiredEnv(env, 'THREADS_APP_ID');
  const appSecret = requiredEnv(env, 'THREADS_APP_SECRET');
  const redirectUri = requiredEnv(env, 'THREADS_REDIRECT_URI');
  const tlsCertPath = requiredEnv(env, 'THREADS_TLS_CERT_PATH');
  const tlsKeyPath = requiredEnv(env, 'THREADS_TLS_KEY_PATH');
  parseRedirectUri(redirectUri);
  return { appId, appSecret, redirectUri, tlsCertPath, tlsKeyPath };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not configured. Set the Threads OAuth variables in the repository root .env.`,
    );
  }
  return value;
}

function parseRedirectUri(value: string): {
  origin: string;
  pathname: string;
  port: number;
} {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('THREADS_REDIRECT_URI must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('THREADS_REDIRECT_URI must use HTTPS.');
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    throw new Error(
      'THREADS_REDIRECT_URI must use the custom hostname registered with Meta, not localhost.',
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      'THREADS_REDIRECT_URI must not contain query parameters or a fragment.',
    );
  }
  return {
    origin: url.origin,
    pathname: url.pathname,
    port: url.port ? Number(url.port) : 443,
  };
}

function parseAuthorizationCallback(url: URL, expectedState: string): string {
  const state = url.searchParams.get('state');
  if (state !== expectedState) {
    throw new Error('Threads authorization callback state did not match.');
  }

  const providerError = url.searchParams.get('error');
  if (providerError) {
    const description =
      url.searchParams.get('error_description') ??
      url.searchParams.get('error_reason') ??
      providerError;
    throw new Error(`Threads authorization was rejected: ${description}`);
  }

  const code = url.searchParams.get('code')?.trim();
  if (!code) {
    throw new Error('Threads authorization callback did not include a code.');
  }
  return code;
}

function parseStoredSession(value: unknown, path: string): ThreadsSession {
  if (!isRecord(value)) return invalidStoredSession(path);
  const version = value['version'];
  const accessToken = value['accessToken'];
  const expiresAt = value['expiresAt'];
  const userId = value['userId'];
  const username = value['username'];
  if (
    version !== 1 ||
    !nonemptyString(accessToken) ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= 0 ||
    !nonemptyString(userId) ||
    !nonemptyString(username)
  ) {
    return invalidStoredSession(path);
  }
  return {
    version,
    accessToken: accessToken.trim(),
    expiresAt,
    userId: userId.trim(),
    username: username.trim(),
  };
}

function invalidStoredSession(path: string): never {
  throw new ThreadsSessionInvalidError(
    `Invalid Threads session at ${path}. Run \`pnpm social:login\` to replace it.`,
  );
}

function parseProfile(value: unknown): ThreadsProfile {
  if (!isRecord(value)) {
    throw new Error('Threads API returned an invalid profile response.');
  }
  const id = value['id'];
  const username = value['username'];
  if (!nonemptyString(id)) {
    throw new Error('Threads API profile response has no id.');
  }
  if (!nonemptyString(username)) {
    throw new Error('Threads API profile response has no username.');
  }
  return { id: id.trim(), username: username.trim() };
}

function createSecureState(): string {
  return randomBytes(32).toString('base64url');
}

async function openUrlInBrowser(url: string): Promise<void> {
  const command = browserCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.executable, command.arguments, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function browserCommand(url: string): {
  executable: string;
  arguments: string[];
} {
  if (process.platform === 'darwin') {
    return { executable: 'open', arguments: [url] };
  }
  if (process.platform === 'win32') {
    return {
      executable: 'rundll32.exe',
      arguments: ['url.dll,FileProtocolHandler', url],
    };
  }
  return { executable: 'xdg-open', arguments: [url] };
}

function respond(
  response: CallbackResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

function sessionsEqual(left: ThreadsSession, right: ThreadsSession): boolean {
  return (
    left.accessToken === right.accessToken &&
    left.expiresAt === right.expiresAt &&
    left.userId === right.userId &&
    left.username === right.username
  );
}

function requiresAuthorization(error: unknown): boolean {
  return error instanceof ThreadsSessionInvalidError;
}

function redactSecrets(message: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (redacted, secret) =>
      secret ? redacted.replaceAll(secret, '[REDACTED]') : redacted,
    message,
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
