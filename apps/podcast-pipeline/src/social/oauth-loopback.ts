import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

/**
 * Both OAuth logins (Threads, YouTube) hand the provider a loopback callback
 * and wait for the browser to come back. The transport differs — Threads needs
 * HTTPS on the port Meta has registered, YouTube takes an ephemeral HTTP port —
 * so only the pieces that must not drift between them live here: the CSRF state
 * source, the browser handoff, the callback response shape, the options both
 * `*AuthOptions` shapes carry, and the authorization-URL params they share.
 */

export interface OAuthCallbackResponse {
  end(body?: string): unknown;
  writeHead(status: number, headers: Record<string, string>): unknown;
}

export interface OAuthLoopbackAuthOptions {
  callbackTimeoutMs?: number;
  createState?: () => string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  additionalScopes?: readonly string[];
  now?: () => number;
  openBrowser?: (url: string) => Promise<void>;
  sessionPath?: string;
}

export interface AuthorizationUrlInput {
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}

export function createSecureState(): string {
  return randomBytes(32).toString('base64url');
}

export async function openUrlInBrowser(url: string): Promise<void> {
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

export function respond(
  response: OAuthCallbackResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

export function applyAuthorizationParams(
  url: URL,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope: string;
  },
): void {
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
}
