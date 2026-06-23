import type {
  EpisodeListRow,
  EpisodeSearchMatchSource,
  EpisodeSearchResult,
  LanguageClassroomLanguageCode,
} from '../types.js';
import {
  type Cursor,
  decodeCursor,
  listEpisodesPaged,
  toEpisodeResponse,
} from './db.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CORPUS_PAGE_SIZE = 50;
const MAX_SNIPPET_CHARACTERS = 180;

interface RankedEpisodeSearchResult {
  row: EpisodeListRow;
  matchSource: EpisodeSearchMatchSource;
  snippet: string | null;
  score: number;
}

interface SearchCorpus {
  rows: EpisodeListRow[];
  expiresAt: number;
}

type LoadPage = (
  limit: number,
  cursor: Cursor | null,
  languageCode: string,
) => Promise<{ rows: EpisodeListRow[]; nextCursor: string | null }>;

interface EpisodeSearchServiceOptions {
  loadPage?: LoadPage;
  now?: () => number;
}

interface FieldMatch {
  score: number;
  segment?: string;
}

export interface EpisodeSearchService {
  search(
    query: string,
    languageCode: LanguageClassroomLanguageCode,
    limit: number,
  ): Promise<EpisodeSearchResult[]>;
  invalidate(): void;
}

export function createEpisodeSearchService(
  options: EpisodeSearchServiceOptions = {},
): EpisodeSearchService {
  const loadPage = options.loadPage ?? listEpisodesPaged;
  const now = options.now ?? Date.now;
  const cache = new Map<string, SearchCorpus>();
  const inflight = new Map<string, Promise<EpisodeListRow[]>>();
  let generation = 0;

  async function loadCorpus(languageCode: string): Promise<EpisodeListRow[]> {
    const rows: EpisodeListRow[] = [];
    let cursor: Cursor | null = null;

    do {
      const page = await loadPage(CORPUS_PAGE_SIZE, cursor, languageCode);
      rows.push(...page.rows);
      cursor = page.nextCursor ? decodeCursor(page.nextCursor) : null;
    } while (cursor);

    return rows;
  }

  async function loadAndCacheCorpus(
    languageCode: string,
    requestGeneration: number,
  ): Promise<EpisodeListRow[]> {
    const rows = await loadCorpus(languageCode);
    if (requestGeneration === generation) {
      cache.set(languageCode, {
        rows,
        expiresAt: now() + CACHE_TTL_MS,
      });
    }
    return rows;
  }

  async function getCorpus(languageCode: string): Promise<EpisodeListRow[]> {
    const cached = cache.get(languageCode);
    if (cached && cached.expiresAt > now()) return cached.rows;

    const pending = inflight.get(languageCode);
    if (pending) return pending;

    const request = loadAndCacheCorpus(languageCode, generation);
    inflight.set(languageCode, request);
    try {
      return await request;
    } finally {
      if (inflight.get(languageCode) === request) {
        inflight.delete(languageCode);
      }
    }
  }

  return {
    async search(query, languageCode, limit) {
      const rows = await getCorpus(languageCode);
      return rankEpisodeSearchResults(rows, query, limit).map((result) => ({
        episode: toEpisodeResponse(result.row),
        matchSource: result.matchSource,
        snippet: result.snippet,
      }));
    },
    invalidate() {
      generation += 1;
      cache.clear();
      inflight.clear();
    },
  };
}

const defaultEpisodeSearchService = createEpisodeSearchService();

export function searchEpisodes(
  query: string,
  languageCode: LanguageClassroomLanguageCode,
  limit: number,
): Promise<EpisodeSearchResult[]> {
  return defaultEpisodeSearchService.search(query, languageCode, limit);
}

export function invalidateEpisodeSearchCache(): void {
  defaultEpisodeSearchService.invalidate();
}

export function rankEpisodeSearchResults(
  rows: EpisodeListRow[],
  rawQuery: string,
  limit: number,
): RankedEpisodeSearchResult[] {
  const query = normalizeSearchText(rawQuery);
  const compactQuery = compactSearchText(query);
  if (!compactQuery) return [];

  return rows
    .map((row) => rankRow(row, query, compactQuery))
    .filter((result): result is RankedEpisodeSearchResult => result !== null)
    .sort(compareRankedResults)
    .slice(0, limit);
}

function rankRow(
  row: EpisodeListRow,
  query: string,
  compactQuery: string,
): RankedEpisodeSearchResult | null {
  const titleMatch = scoreField(row.title, query, compactQuery, 'title');
  const scriptMatch = scoreScript(row.script, query, compactQuery);
  const selected = selectBestMatch(titleMatch, scriptMatch);

  if (!selected) return null;

  return {
    row,
    matchSource: selected.source,
    snippet: snippetForMatch(row.script, selected.source, selected.match),
    score: selected.match.score,
  };
}

function selectBestMatch(
  titleMatch: FieldMatch | null,
  scriptMatch: FieldMatch | null,
): { match: FieldMatch; source: EpisodeSearchMatchSource } | null {
  if (titleMatch && (!scriptMatch || titleMatch.score >= scriptMatch.score)) {
    return { match: titleMatch, source: 'title' };
  }
  return scriptMatch ? { match: scriptMatch, source: 'script' } : null;
}

function snippetForMatch(
  script: string | null,
  source: EpisodeSearchMatchSource,
  match: FieldMatch,
): string | null {
  if (source === 'title') return firstScriptParagraph(script);
  return match.segment ? truncateSnippet(match.segment) : null;
}

function scoreScript(
  script: string | null,
  query: string,
  compactQuery: string,
): FieldMatch | null {
  if (!script?.trim()) return null;

  const normalizedScript = normalizeSearchText(script);
  if (normalizedScript.includes(query)) {
    return {
      score: 700,
      segment: closestScriptSegment(script, query, compactQuery),
    };
  }

  if (Array.from(compactQuery).length <= 2) return null;

  let best: FieldMatch | null = null;
  for (const segment of splitScriptSegments(script)) {
    const match = scoreField(segment, query, compactQuery, 'script');
    if (match && (!best || match.score > best.score)) {
      best = { ...match, segment };
    }
  }
  return best;
}

function scoreField(
  value: string,
  query: string,
  compactQuery: string,
  source: EpisodeSearchMatchSource,
): FieldMatch | null {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return null;

  if (normalizedValue === query) {
    return { score: source === 'title' ? 1200 : 700 };
  }
  if (normalizedValue.startsWith(query)) {
    return { score: source === 'title' ? 1150 : 700 };
  }
  if (normalizedValue.includes(query)) {
    return { score: source === 'title' ? 1050 : 700 };
  }

  const queryLength = Array.from(compactQuery).length;
  if (queryLength <= 2) return null;

  const similarity = ngramCoverage(
    compactQuery,
    compactSearchText(normalizedValue),
  );
  const threshold = fuzzyThreshold(source, queryLength);
  if (similarity < threshold) return null;

  return {
    score: fuzzyScore(source, similarity),
  };
}

function fuzzyThreshold(
  source: EpisodeSearchMatchSource,
  queryLength: number,
): number {
  if (source === 'title') return queryLength <= 4 ? 0.67 : 0.55;
  return queryLength <= 4 ? 0.85 : 0.72;
}

function fuzzyScore(
  source: EpisodeSearchMatchSource,
  similarity: number,
): number {
  if (source === 'title') return 600 + similarity * 300;
  return 300 + similarity * 200;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactSearchText(value: string): string {
  return value.replace(/\s+/g, '');
}

function ngramCoverage(query: string, target: string): number {
  const queryLength = Array.from(query).length;
  const size = queryLength >= 5 ? 3 : 2;
  const queryNgrams = ngrams(query, size);
  if (queryNgrams.size === 0) return target.includes(query) ? 1 : 0;
  const targetNgrams = ngrams(target, size);
  let matches = 0;
  for (const ngram of queryNgrams) {
    if (targetNgrams.has(ngram)) matches += 1;
  }
  return matches / queryNgrams.size;
}

function ngrams(value: string, size: number): Set<string> {
  const characters = Array.from(value);
  const result = new Set<string>();
  for (let index = 0; index <= characters.length - size; index += 1) {
    result.add(characters.slice(index, index + size).join(''));
  }
  return result;
}

function firstScriptParagraph(script: string | null): string | null {
  if (!script?.trim()) return null;
  const paragraph =
    script
      .split(/\n\s*\n/u)
      .map((value) => value.trim())
      .find(Boolean) ?? script.trim();
  return truncateSnippet(paragraph);
}

function closestScriptSegment(
  script: string,
  query: string,
  compactQuery: string,
): string {
  const segments = splitScriptSegments(script);
  return (
    segments.find((segment) => normalizeSearchText(segment).includes(query)) ??
    segments.reduce((best, segment) => {
      const bestScore = ngramCoverage(
        compactQuery,
        compactSearchText(normalizeSearchText(best)),
      );
      const score = ngramCoverage(
        compactQuery,
        compactSearchText(normalizeSearchText(segment)),
      );
      return score > bestScore ? segment : best;
    }, segments[0] ?? script)
  );
}

function splitScriptSegments(script: string): string[] {
  return script
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function truncateSnippet(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  const characters = Array.from(normalized);
  if (characters.length <= MAX_SNIPPET_CHARACTERS) return normalized;
  return `${characters.slice(0, MAX_SNIPPET_CHARACTERS - 1).join('')}…`;
}

function compareRankedResults(
  left: RankedEpisodeSearchResult,
  right: RankedEpisodeSearchResult,
): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;

  const dateOrder =
    Date.parse(right.row.created_at) - Date.parse(left.row.created_at);
  if (dateOrder !== 0) return dateOrder;
  return right.row.id.localeCompare(left.row.id);
}
