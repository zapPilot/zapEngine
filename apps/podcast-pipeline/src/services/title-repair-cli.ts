import { parseArgs } from 'node:util';

import { runCli } from '../lib/cli-runner.js';
import { isMainModule } from '../lib/is-main-module.js';
import { isPlainRecord } from '../lib/typeGuards.js';
import { resolveTransportTitle } from '../social/compose.js';
import {
  rednoteTitleUnits,
  SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT,
} from '../social/policy.js';
import {
  compressEditorialTitle,
  type CompressionResult,
  createTitleLedger,
  type TitleLedger,
} from './editorial-title.js';
import { getPipelineSupabase, throwSupabaseError } from './supabase-client.js';
import { REDNOTE_TITLE_VARIANT_KEY } from './title-variants.js';

/**
 * Operator repair for Rednote titles that no stored value can serve.
 *
 * A backlog built up while the social daemon was paused: Best Titles over the
 * Rednote measure with no valid `title_variants["20"]`. The daemon refuses to
 * cut titles, so such a row never publishes. This tool compresses each Best
 * Title through the same verified path ingest uses and, with `--apply`, stores
 * the result as the Rednote variant. It never touches the Best Title, script,
 * TTS, video or social posts, and repaired rows stop selecting, so it is safe
 * to run again.
 */

const USAGE = `Usage: pnpm titles:repair [--apply] [--limit <n>] [--episode <id>]

Dry-run by default: prints each backlog row's proposed Rednote title and writes
nothing. --apply stores the proposals as title_variants["20"].`;

const PAGE_SIZE = 1_000;

const CLI_OPTIONS = {
  apply: { type: 'boolean', default: false },
  limit: { type: 'string' },
  episode: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

type Result = PromiseLike<{ data: unknown; error: unknown }>;

interface Filter extends PagedQuery {
  eq: (column: string, value: string) => Filter;
  gte: (column: string, value: string) => Filter;
}

interface UpdateFilter extends Result {
  eq: (column: string, value: string) => UpdateFilter;
  select: (columns: string) => Result;
}

/**
 * The slice of the PostgREST builder this tool uses. Spelled out because the
 * generated builder types recurse too deeply through long filter chains.
 */
interface Db {
  from: (table: string) => {
    select: (columns: string) => Filter;
    update: (payload: Record<string, unknown>) => UpdateFilter;
  };
}

export interface RepairRow {
  id: string;
  episodeId: string;
  title: string;
  titleVariants: unknown;
  titleProvenance: unknown;
  rawText: string | null;
  sourceTitle: string | null;
}

export interface RepairOutcome {
  row: RepairRow;
  proposal: string | null;
  reason: string | null;
  costUsd: number;
  verifierRejections: number;
  ledgerModel: string;
}

export interface TitleRepairDependencies {
  db?: Db;
  compress?: (
    ledger: TitleLedger,
    input: Parameters<typeof compressEditorialTitle>[1],
  ) => Promise<CompressionResult>;
  log?: (message: string) => void;
}

export async function runTitleRepairCli(
  args: string[],
  dependencies: TitleRepairDependencies = {},
): Promise<void> {
  const log = dependencies.log ?? console.log;
  const { values } = parseArgs({ args, strict: true, options: CLI_OPTIONS });
  if (values.help) {
    log(USAGE);
    return;
  }
  const limit = parseLimit(values.limit);
  const db = dependencies.db ?? defaultDb();
  const compress = dependencies.compress ?? compressEditorialTitle;

  let rows = await selectBacklog(db, values.episode);
  rows = limit === null ? rows : rows.slice(0, limit);
  log(
    `${values.apply ? 'APPLY' : 'DRY-RUN'}: ${rows.length} Rednote title(s) to repair`,
  );

  let proposed = 0;
  let written = 0;
  let totalCost = 0;
  const problems: string[] = [];
  for (const row of rows) {
    const outcome = await proposeRepair(row, compress);
    totalCost += outcome.costUsd;
    log(formatOutcome(outcome));
    if (outcome.proposal === null) {
      problems.push(row.id);
      continue;
    }
    proposed += 1;
    if (!values.apply) continue;
    if (await applyRepair(db, outcome, outcome.proposal)) {
      written += 1;
    } else {
      log(`  ${row.id}: Best Title changed concurrently; nothing written`);
      problems.push(row.id);
    }
  }
  log(
    `Summary: ${rows.length} selected, ${proposed} proposed, ${written} written, ${problems.length} unresolved, cost $${totalCost.toFixed(4)}`,
  );
}

function defaultDb(): Db {
  const client: unknown = getPipelineSupabase();
  return client as Db;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`--limit must be a positive integer, got "${raw}"`);
  }
  return limit;
}

async function readAll<T>(
  build: (offset: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build(offset);
    if (error) throwSupabaseError(error);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

interface PagedQuery {
  order: (
    column: string,
    options: { ascending: boolean },
  ) => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
}

type EpisodeScopable = Filter;

interface LocalizationRecord {
  id: string;
  episode_id: string;
  title: string;
  title_variants: unknown;
  title_provenance: unknown;
  raw_text: string | null;
}

interface JobRecord {
  episode_id: string;
  status: string;
  legacy_title_override: string | null;
}

/** Read-only: every filter below is evaluated in memory after paged reads. */
export async function selectBacklog(
  db: Db,
  episodeId?: string,
): Promise<RepairRow[]> {
  // Structural, not generic: PostgREST builder types recurse too deeply to
  // thread through a type parameter.
  const scoped = (q: EpisodeScopable): PagedQuery =>
    episodeId ? q.eq('episode_id', episodeId) : q;
  // Posts and jobs are both read for the zh-Hant Rednote lane only.
  const rednoteLaneRows = <T>(table: string, columns: string) =>
    readAll<T>((offset) =>
      scoped(
        db
          .from(table)
          .select(columns)
          .eq('platform', 'rednote')
          .eq('language_code', 'zh-Hant'),
      )
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    );
  const [localizations, episodes, posts, jobs, closures] = await Promise.all([
    readAll<LocalizationRecord>((offset) =>
      scoped(
        db
          .from('episode_localizations')
          .select(
            'id,episode_id,title,title_variants,title_provenance,raw_text',
          )
          .eq('language_code', 'zh-Hant')
          .eq('status', 'completed'),
      )
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    ),
    readAll<{ id: string; source_title: string | null }>((offset) =>
      db
        .from('episodes')
        .select('id,source_title')
        .gte('created_at', SOCIAL_RELEASE_MIN_EPISODE_CREATED_AT)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    ),
    rednoteLaneRows<{ episode_id: string }>('social_posts', 'episode_id'),
    rednoteLaneRows<JobRecord>(
      'social_publish_jobs',
      'episode_id,status,legacy_title_override',
    ),
    readAll<{ episode_id: string }>((offset) =>
      scoped(db.from('social_release_closures').select('episode_id'))
        .order('episode_id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
    ),
  ]);

  const sourceTitles = new Map(episodes.map((e) => [e.id, e.source_title]));
  const posted = new Set(posts.map((p) => p.episode_id));
  const closed = new Set(closures.map((c) => c.episode_id));
  const jobByEpisode = new Map<string, JobRecord>();
  for (const job of jobs) {
    jobByEpisode.set(job.episode_id, job);
    if (job.status === 'skipped') closed.add(job.episode_id);
  }

  const backlog: RepairRow[] = [];
  for (const loc of localizations) {
    if (!sourceTitles.has(loc.episode_id)) continue;
    if (posted.has(loc.episode_id) || closed.has(loc.episode_id)) continue;
    const usable = resolveTransportTitle(
      {
        title: loc.title,
        summary: '',
        description: undefined,
        titleVariants: loc.title_variants,
      },
      'rednote',
      jobByEpisode.get(loc.episode_id)?.legacy_title_override,
    ).title;
    if (usable !== null) continue;
    backlog.push({
      id: loc.id,
      episodeId: loc.episode_id,
      title: loc.title,
      titleVariants: loc.title_variants,
      titleProvenance: loc.title_provenance,
      rawText: loc.raw_text,
      sourceTitle: sourceTitles.get(loc.episode_id) ?? null,
    });
  }
  return backlog;
}

async function proposeRepair(
  row: RepairRow,
  compress: NonNullable<TitleRepairDependencies['compress']>,
): Promise<RepairOutcome> {
  const ledger = createTitleLedger();
  const base = { row, verifierRejections: 0, ledgerModel: ledger.model };
  if (!row.rawText?.trim()) {
    return {
      ...base,
      proposal: null,
      reason: 'skipped: no article text to ground a repair',
      costUsd: 0,
    };
  }
  try {
    const result = await compress(ledger, {
      best: row.title,
      sourceTitle: row.sourceTitle ?? row.title,
      grounding: { articleText: row.rawText },
    });
    return {
      ...base,
      proposal: result.title,
      reason: result.reason,
      verifierRejections: result.verifierRejections,
      ledgerModel: ledger.model,
      costUsd: sumCost(ledger),
    };
  } catch (error) {
    return {
      ...base,
      proposal: null,
      reason: `error: ${error instanceof Error ? error.message : String(error)}`,
      costUsd: sumCost(ledger),
    };
  }
}

function sumCost(ledger: TitleLedger): number {
  return ledger.cost.reduce((sum, line) => sum + line.costUsd, 0);
}

function formatOutcome(outcome: RepairOutcome): string {
  const { row } = outcome;
  const head = `${row.id} "${row.title}" (${rednoteTitleUnits(row.title)} units)`;
  const verdict =
    outcome.proposal === null
      ? `no variant: ${outcome.reason ?? 'unknown'}`
      : `-> "${outcome.proposal}" (${rednoteTitleUnits(outcome.proposal)} units)`;
  return `${head} ${verdict} cost $${outcome.costUsd.toFixed(4)}`;
}

async function applyRepair(
  db: Db,
  outcome: RepairOutcome,
  proposal: string,
): Promise<boolean> {
  const { row } = outcome;
  const variants = isPlainRecord(row.titleVariants) ? row.titleVariants : {};
  const provenance = isPlainRecord(row.titleProvenance)
    ? { ...row.titleProvenance, variantSource: 'repair' }
    : {
        version: 1,
        thesis: '',
        angle: '',
        evidence: [],
        candidates: 0,
        rounds: 0,
        verifierRejections: outcome.verifierRejections,
        model: outcome.ledgerModel,
        variantSource: 'repair',
      };
  const { data, error } = await db
    .from('episode_localizations')
    .update({
      title_variants: {
        ...variants,
        [REDNOTE_TITLE_VARIANT_KEY]: { title: proposal, method: 'llm' },
      },
      title_provenance: provenance,
    })
    .eq('id', row.id)
    .eq('title', row.title)
    .select('id');
  if (error) throwSupabaseError(error);
  return Array.isArray(data) && data.length > 0;
}

if (isMainModule(import.meta.url)) {
  runCli(() => runTitleRepairCli(process.argv.slice(2)));
}
