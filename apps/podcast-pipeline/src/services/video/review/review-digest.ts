import type { ReviewExportRow } from './review-store.js';

export function reviewDigestMarkdown(rows: readonly ReviewExportRow[]): string {
  if (rows.length === 0) return '# Podcast visual reviews\n\nNo matching reviews.\n';
  const sections = rows.map((review) => {
    const scope = [review.languageCode, review.sceneId].filter(Boolean).join(' / ') || 'episode';
    const issues = review.issueCategories.join(', ') || 'none';
    return [
      `## ${review.title ?? review.episodeId}`,
      '',
      `- Review: \`${review.id}\``,
      `- Episode: \`${review.episodeId}\``,
      `- Scope: ${scope}`,
      `- Verdict: **${review.verdict}**`,
      `- Status: ${review.status}`,
      `- Issues: ${issues}`,
      review.visualHash ? `- Visual hash: \`${review.visualHash}\`` : null,
      review.note ? `- Note: ${review.note}` : null,
      '- Pipeline context:',
      '```json',
      JSON.stringify(review.pipelineContext, null, 2),
      '```',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  });
  return `# Podcast visual reviews\n\n${sections.join('\n\n')}\n`;
}

export function reviewDigestJson(rows: readonly ReviewExportRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}
