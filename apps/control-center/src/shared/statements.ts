import type { OperationalStatus } from './types.js';

/**
 * A sentence is built from plain-text segments and value segments the rule
 * fired on. Only value segments carry a tone, so a renderer can colour the
 * one number a rule judged without inventing a colour for the rest of the
 * sentence — "colour is a verdict, not decoration".
 */
export type StatementSegment =
  | { text: string }
  | { value: string; tone: 'success' | 'warning' | 'error' | 'neutral' };

/**
 * The five narrative domains Home summarizes, in reading order. Distinct
 * from `OperationsDomain` (the finer eight-way infra classification
 * `prioritize.ts` scores on): a Statement is a page-level story, not a
 * signal source.
 */
export const STATEMENT_DOMAINS = [
  'reliability',
  'product',
  'pipeline',
  'spend',
  'growth',
] as const;

export type StatementDomain = (typeof STATEMENT_DOMAINS)[number];

export type DeltaTone = 'good' | 'bad' | 'neutral';

/**
 * One row of Home's "Read this first" panel — L0 of the three disclosure
 * levels. `series`/`value`/`delta` describe the one headline number the
 * sentence is about; `evidenceRef` names the panel the L1 expander should
 * show, never a raw table.
 */
export interface Statement {
  domain: StatementDomain;
  status: OperationalStatus;
  score: number;
  sentence: StatementSegment[];
  kicker: string;
  series: number[];
  value: string;
  delta: string;
  deltaTone: DeltaTone;
  evidenceRef: string;
  url: string | null;
}

/** One column of a StatementHeader's "Because ·" fact row. */
export interface StatementFact {
  kicker: string;
  value: string;
  note: string;
}

/**
 * The page-top banner rendered on Growth, Product, Reliability, Pipeline and
 * Economics: one bigger sentence (usually two or three rules' segments
 * concatenated) plus the facts that back it. Built by the same rule module
 * as `Statement`, so a page's headline and Home's summary of it never say
 * something different.
 */
export interface StatementHeaderData {
  domain: StatementDomain;
  status: OperationalStatus;
  sentence: StatementSegment[];
  facts: StatementFact[];
}

export interface StatementsResponse {
  generatedAt: string;
  /** Home's five rows, sorted by the same priority score as `prioritize.ts`. */
  statements: Statement[];
  /** One per `StatementDomain`, for each page's StatementHeader. */
  headers: StatementHeaderData[];
}
