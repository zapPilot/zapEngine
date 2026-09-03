import { describe, expect, it } from 'vitest';

import {
  parsePodcastIngestJobRow,
  parsePodcastIngestJobRpcResult,
  PodcastIngestJobContractError,
} from './ingest-jobs.js';

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    source_url: 'https://www.panewslab.com/article',
    language_code: 'zh-Hant',
    telegram_chat_id: '123456',
    status: 'processing',
    attempt_count: 1,
    lease_owner: 'owner-1',
    lease_expires_at: '2026-08-30T22:30:00.000Z',
    last_error: null,
    ...overrides,
  };
}

function nullCompositeRow() {
  return {
    id: null,
    source_url: null,
    language_code: null,
    telegram_chat_id: null,
    status: null,
    attempt_count: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    created_at: null,
    updated_at: null,
  };
}

describe('podcast ingest job RPC contract', () => {
  it('treats Postgres all-null claim composites as no claimed job', () => {
    expect(parsePodcastIngestJobRpcResult([nullCompositeRow()])).toBeNull();
    expect(parsePodcastIngestJobRpcResult(nullCompositeRow())).toBeNull();
  });

  it('parses a valid durable ingest envelope', () => {
    expect(parsePodcastIngestJobRpcResult([validRow()])).toMatchObject({
      source_url: 'https://www.panewslab.com/article',
      language_code: 'zh-Hant',
      telegram_chat_id: '123456',
      status: 'processing',
      attempt_count: 1,
    });
  });

  it('accepts a null Telegram chat id for an operator recovery job', () => {
    expect(
      parsePodcastIngestJobRpcResult([validRow({ telegram_chat_id: null })]),
    ).toMatchObject({
      telegram_chat_id: null,
      status: 'processing',
    });
  });

  it.each([false, 0, ''])(
    'rejects a malformed non-null RPC payload %j',
    (payload) => {
      expect(() => parsePodcastIngestJobRpcResult(payload)).toThrow(
        PodcastIngestJobContractError,
      );
    },
  );

  it.each([
    [null, 'source_url must be a non-empty string'],
    ['', 'source_url must be a non-empty string'],
    ['null', 'source_url must be an http(s) URL'],
    ['mailto:podcast@example.com', 'source_url must be an http(s) URL'],
  ])('rejects an invalid source URL %j', (sourceUrl, message) => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ source_url: sourceUrl })),
    ).toThrow(message);
  });

  it('preserves the durable job id on a malformed non-null row', () => {
    try {
      parsePodcastIngestJobRow(validRow({ source_url: null }));
      expect.unreachable('expected parser to reject the malformed row');
    } catch (error) {
      expect(error).toBeInstanceOf(PodcastIngestJobContractError);
      expect((error as PodcastIngestJobContractError).jobId).toBe(
        '00000000-0000-4000-8000-000000000099',
      );
    }
  });

  it('rejects an empty Telegram chat id on a non-null row', () => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ telegram_chat_id: '   ' })),
    ).toThrow('telegram_chat_id must be a non-empty string');
  });
});
