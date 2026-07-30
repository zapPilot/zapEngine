import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveGcpClientOptions } from './gcp-credentials.js';

describe('resolveGcpClientOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns undefined when GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not set', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', '');
    expect(resolveGcpClientOptions()).toBeUndefined();
  });

  it('uses GOOGLE_APPLICATION_CREDENTIALS as a credentials file path fallback', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', '');
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/secrets/google-sa.json');

    expect(resolveGcpClientOptions()).toEqual({
      keyFilename: '/secrets/google-sa.json',
    });
  });

  it('throws when GOOGLE_APPLICATION_CREDENTIALS_BASE64 is not valid base64', () => {
    vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64', 'not-valid-base64!!!');
    expect(() => resolveGcpClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: expected base64-encoded service account JSON',
    );
  });

  it('throws when service account JSON is missing client_email', () => {
    const credentials = {
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => resolveGcpClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('throws when service account JSON is missing private_key', () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => resolveGcpClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('throws when service account JSON is missing project_id', () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );
    expect(() => resolveGcpClientOptions()).toThrow(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  });

  it('builds TTS client options from base64 service account JSON', () => {
    const credentials = {
      client_email: 'tts@example.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
      project_id: 'test-project',
    };
    vi.stubEnv(
      'GOOGLE_APPLICATION_CREDENTIALS_BASE64',
      Buffer.from(JSON.stringify(credentials), 'utf8').toString('base64'),
    );

    expect(resolveGcpClientOptions()).toEqual({
      credentials,
      projectId: 'test-project',
    });
  });
});
