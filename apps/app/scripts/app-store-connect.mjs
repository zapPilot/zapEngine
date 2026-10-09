import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 20;
const CREDENTIAL_NAMES = [
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
];
const TRANSIENT =
  'Apple is temporarily unable to verify the version state; no version decision ' +
  'was made. Re-run the release later.';

const base64url = (input) => Buffer.from(input).toString('base64url');

/**
 * Reads the App Store Connect API key settings and removes them from `env` so
 * child processes (eas-cli) never inherit them.
 */
export function takeAppStoreConnectCredentials(env = process.env) {
  const missing = CREDENTIAL_NAMES.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing App Store Connect API credentials: ${missing.join(', ')}. ` +
        'CI provides them from the ios-release environment; locally export the same ' +
        'names (see apps/app/docs/ios-release.md).',
    );
  }

  const keyPath = env.APPLE_API_KEY.trim();
  let privateKey;

  try {
    privateKey = createPrivateKey(readFileSync(keyPath));
  } catch {
    throw new Error(
      `APPLE_API_KEY (${keyPath}) is not a readable PEM private key (.p8).`,
    );
  }

  const credentials = {
    privateKey,
    keyId: env.APPLE_API_KEY_ID.trim(),
    issuerId: env.APPLE_API_ISSUER.trim(),
  };

  for (const name of CREDENTIAL_NAMES) {
    delete env[name];
  }

  return credentials;
}

export function createAppStoreConnectToken(
  { privateKey, keyId, issuerId },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = base64url(
    JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: issuerId,
      iat: nowSeconds,
      exp: nowSeconds + 600,
      aud: 'appstoreconnect-v1',
    }),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function describeAppleErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];

  return errors
    .map((entry) =>
      [entry.code, entry.title, entry.detail].filter(Boolean).join(' - '),
    )
    .filter(Boolean)
    .join('; ');
}

function failure(message, body) {
  const detail = describeAppleErrors(body);

  return new Error(detail ? `${message} Apple said: ${detail}` : message);
}

async function fetchPage(url, { token, fetchImpl, appId }) {
  let response;

  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${TRANSIENT} (network error or timeout)`);
  }

  let body;
  let parseFailed = false;

  try {
    body = await response.json();
  } catch {
    parseFailed = true;
  }

  if (response.status === 401) {
    throw failure(
      'App Store Connect rejected the credentials (401): APPLE_API_KEY_ID / APPLE_API_ISSUER do not match the key, or the key was revoked.',
      body,
    );
  }

  if (response.status === 403) {
    throw failure(
      'App Store Connect key lacks permission (403): the team key needs the App Manager role.',
      body,
    );
  }

  if (response.status === 404) {
    throw failure(
      `App Store Connect cannot see app ${appId} (404). Check the key belongs to the team that owns it.`,
      body,
    );
  }

  if (!response.ok || parseFailed) {
    throw failure(`${TRANSIENT} (HTTP ${response.status})`, body);
  }

  return body;
}

async function fetchAll(path, query, context) {
  const rows = [];
  let url = `${API_ORIGIN}${path}?${new URLSearchParams(query)}`;

  for (let page = 0; url; page += 1) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `App Store Connect ${path} exceeded ${MAX_PAGES} pages; refusing to decide on partial data.`,
      );
    }

    const body = await fetchPage(url, context);
    rows.push(...(Array.isArray(body.data) ? body.data : []));
    url = body.links?.next ?? '';
  }

  return rows;
}

/**
 * @returns {Promise<{
 *   storeVersions: { version: string, state: string }[],
 *   trainVersions: string[],
 * }>}
 */
export async function fetchIosVersionState({
  appId,
  credentials,
  fetchImpl = fetch,
}) {
  const context = {
    token: createAppStoreConnectToken(credentials),
    fetchImpl,
    appId,
  };
  const [versions, trains] = await Promise.all([
    fetchAll(
      `/v1/apps/${appId}/appStoreVersions`,
      { 'filter[platform]': 'IOS', limit: '200' },
      context,
    ),
    // preReleaseVersions rejects filter[platform] (HTTP 400, verified against
    // the live API); the IOS filter below covers it client-side.
    fetchAll(`/v1/apps/${appId}/preReleaseVersions`, { limit: '200' }, context),
  ]);

  return {
    storeVersions: versions
      .filter((row) => row.attributes?.platform === 'IOS')
      .map((row) => ({
        version: String(row.attributes.versionString ?? ''),
        state: String(
          row.attributes.appVersionState ?? row.attributes.appStoreState ?? '',
        ),
      })),
    trainVersions: trains
      .filter((row) => row.attributes?.platform === 'IOS')
      .map((row) => String(row.attributes.version ?? '')),
  };
}
