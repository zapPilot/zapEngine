import { type ParsedFlagArgs, parseFlagArgs } from '../../../lib/cli-args.js';
import { runCli } from '../../../lib/cli-runner.js';
import { isEpisodeId } from '../../request-validation.js';
import { reviewDigestJson, reviewDigestMarkdown } from './review-digest.js';
import { listReviewsForExport, resolveReview } from './review-store.js';

const USAGE =
  'Usage: review:export export [--status open|triaged|all] [--episode UUID] [--format md|json] [--limit N]\n' +
  '       review:resolve resolve --id UUID --status triaged|resolved [--note TEXT]';

export async function runReviewCli(
  argv = process.argv.slice(2),
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): Promise<void> {
  const parsed = parseFlagArgs(argv);
  if (parsed.command === 'export') {
    write(await runExport(parsed));
    return;
  }
  if (parsed.command === 'resolve') {
    write(await runResolve(parsed));
    return;
  }
  throw new Error(USAGE);
}

async function runExport(parsed: ParsedFlagArgs): Promise<string> {
  const status = flagString(parsed.flags['status']) ?? 'open';
  if (status !== 'open' && status !== 'triaged' && status !== 'all') {
    throw new Error('--status must be open, triaged, or all');
  }
  const format = flagString(parsed.flags['format']) ?? 'md';
  if (format !== 'md' && format !== 'json') {
    throw new Error('--format must be md or json');
  }
  const episodeId = flagString(parsed.flags['episode']);
  if (episodeId && !isEpisodeId(episodeId)) {
    throw new Error('--episode must be a UUID');
  }
  const rows = await listReviewsForExport({
    status,
    ...(episodeId ? { episodeId } : {}),
    limit: parseLimit(flagString(parsed.flags['limit'])),
  });
  return format === 'json'
    ? reviewDigestJson(rows)
    : reviewDigestMarkdown(rows);
}

async function runResolve(parsed: ParsedFlagArgs): Promise<string> {
  const id = flagString(parsed.flags['id']);
  const status = flagString(parsed.flags['status']);
  const note = flagString(parsed.flags['note']);
  if (!id || !isEpisodeId(id)) throw new Error('--id must be a review UUID');
  if (status !== 'triaged' && status !== 'resolved') {
    throw new Error('--status must be triaged or resolved');
  }
  const changed = await resolveReview({ id, status, note });
  if (!changed) throw new Error(`Review ${id} was not found`);
  return `Review ${id} marked ${status}.\n`;
}

function flagString(value: string | boolean | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

function parseLimit(value: string | null): number {
  if (!value) return 100;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error('--limit must be an integer from 1 to 1000');
  }
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(() => runReviewCli());
}
