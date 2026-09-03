import { describe, expect, it } from 'vitest';

import { reviewDigestJson, reviewDigestMarkdown } from './review-digest.js';
import type { ReviewExportRow } from './review-store.js';

function row(overrides: Partial<ReviewExportRow> = {}): ReviewExportRow {
  return {
    id: 'review-1',
    episodeId: 'episode-1',
    title: 'Episode title',
    visualHash: 'hash-1',
    languageCode: 'ja',
    sceneId: 'scene-02',
    reviewer: 'operator',
    verdict: 'reject' as ReviewExportRow['verdict'],
    issueCategories: [
      'wrong-subject',
      'blurry',
    ] as ReviewExportRow['issueCategories'],
    note: 'Looks off',
    pipelineContext: { stage: 'plan-assets' },
    status: 'open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('reviewDigestMarkdown', () => {
  it('renders a placeholder when there are no reviews', () => {
    expect(reviewDigestMarkdown([])).toBe(
      '# Podcast visual reviews\n\nNo matching reviews.\n',
    );
  });

  it('renders every field of a fully populated review', () => {
    const markdown = reviewDigestMarkdown([row()]);
    expect(markdown).toContain('## Episode title');
    expect(markdown).toContain('- Review: `review-1`');
    expect(markdown).toContain('- Episode: `episode-1`');
    expect(markdown).toContain('- Scope: ja / scene-02');
    expect(markdown).toContain('- Verdict: **reject**');
    expect(markdown).toContain('- Status: open');
    expect(markdown).toContain('- Issues: wrong-subject, blurry');
    expect(markdown).toContain('- Visual hash: `hash-1`');
    expect(markdown).toContain('- Note: Looks off');
    expect(markdown).toContain('```json\n{\n  "stage": "plan-assets"\n}\n```');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('falls back to the episode id, episode scope and none for sparse reviews', () => {
    const markdown = reviewDigestMarkdown([
      row({
        title: null,
        visualHash: null,
        languageCode: null,
        sceneId: null,
        issueCategories: [],
        note: null,
        pipelineContext: {},
      }),
    ]);
    expect(markdown).toContain('## episode-1');
    expect(markdown).toContain('- Scope: episode');
    expect(markdown).toContain('- Issues: none');
    expect(markdown).not.toContain('Visual hash');
    expect(markdown).not.toContain('- Note:');
  });

  it('separates multiple reviews with a blank line', () => {
    const markdown = reviewDigestMarkdown([row(), row({ id: 'review-2' })]);
    expect(markdown).toContain('```\n\n## Episode title');
    expect(markdown).toContain('- Review: `review-2`');
  });
});

describe('reviewDigestJson', () => {
  it('pretty prints the rows with a trailing newline', () => {
    const rows = [row()];
    expect(reviewDigestJson(rows)).toBe(`${JSON.stringify(rows, null, 2)}\n`);
  });
});
