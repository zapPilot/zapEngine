import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewExportRow } from './review-store.js';

const store = vi.hoisted(() => ({
  listReviewsForExport: vi.fn(),
  resolveReview: vi.fn(),
}));

vi.mock('./review-store.js', () => store);

import { runReviewCli } from './cli.js';

const REVIEW_ID = '00000000-0000-4000-8000-000000000001';
const EPISODE_ID = '00000000-0000-4000-8000-000000000002';

function exportRow(): ReviewExportRow {
  return {
    id: REVIEW_ID,
    episodeId: EPISODE_ID,
    title: 'Title',
    visualHash: null,
    languageCode: null,
    sceneId: null,
    reviewer: 'operator',
    verdict: 'reject' as ReviewExportRow['verdict'],
    issueCategories: [],
    note: null,
    pipelineContext: {},
    status: 'open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

let output: string[];

beforeEach(() => {
  output = [];
  store.listReviewsForExport.mockReset().mockResolvedValue([]);
  store.resolveReview.mockReset();
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runReviewCli', () => {
  it('prints usage for a missing or unknown command', async () => {
    await expect(runReviewCli([])).rejects.toThrow(/^Usage: review:export/u);
    await expect(runReviewCli(['nope'])).rejects.toThrow(
      'review:resolve resolve',
    );
    expect(output).toEqual([]);
  });

  describe('export', () => {
    it('uses open/md/100 defaults and writes markdown', async () => {
      store.listReviewsForExport.mockResolvedValueOnce([exportRow()]);

      await runReviewCli(['export']);

      expect(store.listReviewsForExport).toHaveBeenCalledWith({
        status: 'open',
        limit: 100,
      });
      expect(output.join('')).toContain('# Podcast visual reviews');
      expect(output.join('')).toContain(`- Review: \`${REVIEW_ID}\``);
    });

    it('passes explicit filters through and writes json', async () => {
      store.listReviewsForExport.mockResolvedValueOnce([exportRow()]);

      await runReviewCli([
        'export',
        '--status',
        'all',
        '--format',
        'json',
        '--episode',
        EPISODE_ID,
        '--limit',
        '7',
      ]);

      expect(store.listReviewsForExport).toHaveBeenCalledWith({
        status: 'all',
        episodeId: EPISODE_ID,
        limit: 7,
      });
      expect(JSON.parse(output.join(''))).toEqual([exportRow()]);
    });

    it('treats a bare flag or blank value as unset', async () => {
      await runReviewCli(['export', '--episode', '  ', '--limit']);
      expect(store.listReviewsForExport).toHaveBeenCalledWith({
        status: 'open',
        limit: 100,
      });
    });

    it.each([
      [['--status', 'bogus'], '--status must be open, triaged, or all'],
      [['--format', 'xml'], '--format must be md or json'],
      [['--episode', 'not-a-uuid'], '--episode must be a UUID'],
      [['--limit', '0'], '--limit must be an integer from 1 to 1000'],
      [['--limit', '1001'], '--limit must be an integer from 1 to 1000'],
      [['--limit', 'abc'], '--limit must be an integer from 1 to 1000'],
    ])('rejects %j', async (flags, message) => {
      await expect(runReviewCli(['export', ...flags])).rejects.toThrow(message);
      expect(store.listReviewsForExport).not.toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('marks a review and reports success', async () => {
      store.resolveReview.mockResolvedValueOnce(true);

      await runReviewCli([
        'resolve',
        '--id',
        REVIEW_ID,
        '--status',
        'resolved',
        '--note',
        'fixed',
      ]);

      expect(store.resolveReview).toHaveBeenCalledWith({
        id: REVIEW_ID,
        status: 'resolved',
        note: 'fixed',
      });
      expect(output).toEqual([`Review ${REVIEW_ID} marked resolved.\n`]);
    });

    it('fails when the review does not exist', async () => {
      store.resolveReview.mockResolvedValueOnce(false);
      await expect(
        runReviewCli(['resolve', '--id', REVIEW_ID, '--status', 'triaged']),
      ).rejects.toThrow(`Review ${REVIEW_ID} was not found`);
      expect(store.resolveReview).toHaveBeenCalledWith({
        id: REVIEW_ID,
        status: 'triaged',
        note: null,
      });
    });

    it('rejects a missing or malformed id', async () => {
      await expect(
        runReviewCli(['resolve', '--status', 'triaged']),
      ).rejects.toThrow('--id must be a review UUID');
      await expect(
        runReviewCli(['resolve', '--id', 'nope', '--status', 'triaged']),
      ).rejects.toThrow('--id must be a review UUID');
      expect(store.resolveReview).not.toHaveBeenCalled();
    });

    it('rejects an invalid status', async () => {
      await expect(
        runReviewCli(['resolve', '--id', REVIEW_ID, '--status', 'open']),
      ).rejects.toThrow('--status must be triaged or resolved');
      await expect(
        runReviewCli(['resolve', '--id', REVIEW_ID]),
      ).rejects.toThrow('--status must be triaged or resolved');
      expect(store.resolveReview).not.toHaveBeenCalled();
    });
  });
});
