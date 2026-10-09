import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import * as ascModule from '../scripts/app-store-connect.mjs';

type Env = Record<string, string | undefined>;
const takeAppStoreConnectCredentials =
  ascModule.takeAppStoreConnectCredentials as unknown as (env: Env) => {
    keyId: string;
    issuerId: string;
  };
const createAppStoreConnectToken = ascModule.createAppStoreConnectToken as (
  credentials: unknown,
  nowSeconds: number,
) => string;
const fetchIosVersionState = ascModule.fetchIosVersionState as (input: {
  appId: string;
  credentials: unknown;
  fetchImpl: unknown;
}) => Promise<unknown>;

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function writeKey(contents = pem): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'asc-key-')), 'k.p8');
  writeFileSync(file, contents);

  return file;
}

const credentials = { privateKey, keyId: 'KEYID123', issuerId: 'issuer-uuid' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('App Store Connect token', () => {
  it('signs a short-lived ES256 JWT Apple can verify', () => {
    const token = createAppStoreConnectToken(credentials, 1_000) as string;
    const [header, payload, signature] = token.split('.') as [
      string,
      string,
      string,
    ];

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEYID123',
      typ: 'JWT',
    });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims).toEqual({
      iss: 'issuer-uuid',
      iat: 1_000,
      exp: 1_600,
      aud: 'appstoreconnect-v1',
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(1200);

    const raw = Buffer.from(signature, 'base64url');
    expect(raw).toHaveLength(64);
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        raw,
      ),
    ).toBe(true);
  });
});

describe('credentials', () => {
  const env = (extra: Record<string, string> = {}) => ({
    APPLE_API_KEY: writeKey(),
    APPLE_API_KEY_ID: 'KEYID123',
    APPLE_API_ISSUER: 'issuer-uuid',
    ...extra,
  });

  it('names every missing variable without echoing values', () => {
    expect(() =>
      takeAppStoreConnectCredentials({ APPLE_API_KEY_ID: 'secret-id' }),
    ).toThrow(/APPLE_API_KEY, APPLE_API_ISSUER/u);
    expect(() =>
      takeAppStoreConnectCredentials({ APPLE_API_KEY_ID: 'secret-id' }),
    ).not.toThrow(/secret-id/u);
  });

  it('rejects a missing file and a non-PEM file without leaking content', () => {
    expect(() =>
      takeAppStoreConnectCredentials(env({ APPLE_API_KEY: '/nope/k.p8' })),
    ).toThrow(/not a readable PEM/u);

    const bad = writeKey('TOP-SECRET-not-a-key');
    expect(() =>
      takeAppStoreConnectCredentials(env({ APPLE_API_KEY: bad })),
    ).toThrow(/not a readable PEM/u);
    expect(() =>
      takeAppStoreConnectCredentials(env({ APPLE_API_KEY: bad })),
    ).not.toThrow(/TOP-SECRET/u);
  });

  it('removes the variables from env after reading them', () => {
    const source: Record<string, string | undefined> = env({ KEEP: 'yes' });
    const taken = takeAppStoreConnectCredentials(source);

    expect(taken.keyId).toBe('KEYID123');
    expect(taken.issuerId).toBe('issuer-uuid');
    expect(Object.keys(source)).toEqual(['KEEP']);
  });
});

describe('fetchIosVersionState', () => {
  const row = (attributes: Record<string, string>) => ({ attributes });

  it('paginates both endpoints, filters to IOS and prefers appVersionState', async () => {
    const urls: string[] = [];
    const headers: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      headers.push(
        String((init.headers as Record<string, string>).Authorization),
      );

      if (url.includes('page2')) {
        return json(200, {
          data: [
            row({
              platform: 'IOS',
              versionString: '3.0.2',
              appStoreState: 'PREPARE_FOR_SUBMISSION',
            }),
          ],
        });
      }

      if (url.includes('/appStoreVersions')) {
        return json(200, {
          data: [
            row({
              platform: 'IOS',
              versionString: '3.0.1',
              appVersionState: 'READY_FOR_DISTRIBUTION',
              appStoreState: 'IGNORED',
            }),
            row({
              platform: 'MAC_OS',
              versionString: '9.9.9',
              appVersionState: 'READY_FOR_DISTRIBUTION',
            }),
          ],
          links: {
            next: 'https://api.appstoreconnect.apple.com/v1/apps/1/appStoreVersions?page2',
          },
        });
      }

      return json(200, {
        data: [
          row({ platform: 'IOS', version: '3.0.1' }),
          row({ platform: 'TV_OS', version: '8.0.0' }),
        ],
      });
    });

    const state = await fetchIosVersionState({
      appId: '1',
      credentials,
      fetchImpl,
    });

    expect(state).toEqual({
      storeVersions: [
        { version: '3.0.1', state: 'READY_FOR_DISTRIBUTION' },
        { version: '3.0.2', state: 'PREPARE_FOR_SUBMISSION' },
      ],
      trainVersions: ['3.0.1'],
    });
    expect(urls.some((u) => u.includes('/v1/apps/1/preReleaseVersions?'))).toBe(
      true,
    );
    expect(
      urls.find(
        (u) => u.includes('/appStoreVersions?') && !u.includes('page2'),
      ),
    ).toContain('filter%5Bplatform%5D=IOS');
    expect(
      headers.every((h) => /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/u.test(h)),
    ).toBe(true);
  });

  const failing = (response: () => Promise<Response>) =>
    fetchIosVersionState({
      appId: '1',
      credentials,
      fetchImpl: vi.fn(response),
    });

  it.each([
    [401, /credentials/u],
    [403, /App Manager/u],
    [404, /cannot see app 1/u],
    [429, /temporarily unable/u],
    [500, /temporarily unable/u],
  ])('maps HTTP %i to an actionable message', async (status, pattern) => {
    await expect(
      failing(async () =>
        json(status, { errors: [{ code: 'X', title: 'T', detail: 'D' }] }),
      ),
    ).rejects.toThrow(pattern);
  });

  it('includes Apple error details and never the token or key', async () => {
    const error = await failing(async () =>
      json(403, {
        errors: [{ code: 'FORBIDDEN', title: 'Nope', detail: 'role' }],
      }),
    ).catch((e: Error) => e);

    expect((error as Error).message).toContain('FORBIDDEN - Nope - role');
    expect((error as Error).message).not.toMatch(/Bearer|BEGIN PRIVATE|eyJ/u);
  });

  it('treats network errors, timeouts and non-JSON as transient', async () => {
    await expect(
      failing(async () => {
        throw new TypeError('boom');
      }),
    ).rejects.toThrow(/temporarily unable/u);
    await expect(
      failing(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    ).rejects.toThrow(/temporarily unable/u);
    await expect(
      failing(async () => new Response('<html>', { status: 200 })),
    ).rejects.toThrow(/temporarily unable/u);
  });

  it('refuses to decide on endlessly paginated data', async () => {
    await expect(
      failing(async () =>
        json(200, {
          data: [],
          links: { next: 'https://api.appstoreconnect.apple.com/next' },
        }),
      ),
    ).rejects.toThrow(/exceeded/u);
  });
});
