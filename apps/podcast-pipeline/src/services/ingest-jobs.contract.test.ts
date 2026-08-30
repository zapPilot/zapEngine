import { describe, expect, it } from 'vitest';

import {
  parsePodcastIngestJobRow,
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

describe('parsePodcastIngestJobRow', () => {
  it('parses a valid durable ingest envelope', () => {
    expect(parsePodcastIngestJobRow(validRow())).toMatchObject({
      source_url: 'https://www.panewslab.com/article',
      language_code: 'zh-Hant',
      telegram_chat_id: '123456',
      status: 'processing',
      attempt_count: 1,
    });
  });

  it.each([
    [null, 'source_url must be a non-empty string'],
    ['', 'source_url must be a non-empty string'],
    ['null', 'source_url must be an http(s) URL'],
    ['ftp://www.panewslab.com/article', 'source_url must be an http(s) URL'],
  ])('rejects an invalid source URL %j', (sourceUrl, message) => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ source_url: sourceUrl })),
    ).toThrow(message);
  });

  it('preserves the durable job id on a contract failure', () => {
    try {
      parsePodcastIngestJobRow(validRow({ source_url: null }));
      expect.unreachable('expected parser to reject the poison row');
    } catch (error) {
      expect(error).toBeInstanceOf(PodcastIngestJobContractError);
      expect((error as PodcastIngestJobContractError).jobId).toBe(
        '00000000-0000-4000-8000-000000000099',
      );
    }
  });

  it('rejects an empty Telegram chat id', () => {
    expect(() =>
      parsePodcastIngestJobRow(validRow({ telegram_chat_id: '   ' })),
    ).toThrow('telegram_chat_id must be a non-empty string');
  });
});
