import { isPlainRecord } from '../lib/typeGuards.js';
import { fitsRednoteTitle, REDNOTE_TITLE_MAX_UNITS } from '../social/policy.js';

/**
 * `title_variants["20"]` is the Rednote title measured in the platform's own
 * units (`rednoteTitleUnits`), not in code points. The key never changed: a
 * legacy `llm` variant written under the old 20-code-point rule is a strict
 * subset of the new budget, so it still reads as valid. Titles are never cut
 * mechanically; `truncate` is a legacy method that every reader rejects.
 */
export type TitleVariants = Record<string, { title: string; method: 'llm' }>;

export const REDNOTE_TITLE_VARIANT_KEY = String(REDNOTE_TITLE_MAX_UNITS);

/** Rejects a missing, truncated, multi-line, or over-budget stored variant. */
export function readRednoteTitleVariant(raw: unknown): string | null {
  if (!isPlainRecord(raw)) return null;
  const variant = raw[REDNOTE_TITLE_VARIANT_KEY];
  if (
    !isPlainRecord(variant) ||
    typeof variant['title'] !== 'string' ||
    variant['method'] !== 'llm'
  )
    return null;
  const title = variant['title'].trim();
  return isUsableRednoteTitle(title) ? title : null;
}

export function isUsableRednoteTitle(title: string): boolean {
  return title.length > 0 && !/[\r\n]/u.test(title) && fitsRednoteTitle(title);
}

/**
 * Compact `episode_localizations.title_provenance`: why this Best Title was
 * chosen and where its Rednote variant came from. Evidence quotes are capped at
 * three of at most 120 characters, so the row stays small.
 */
export interface TitleProvenance {
  version: 1;
  thesis: string;
  angle: string;
  evidence: string[];
  candidates: number;
  rounds: number;
  verifierRejections: number;
  model: string;
  /** Who wrote `title_variants["20"]`; `null` when the Best Title fits as-is. */
  variantSource: 'ingest' | 'repair' | null;
}

export const TITLE_PROVENANCE_EVIDENCE_MAX = 3;
export const TITLE_PROVENANCE_EVIDENCE_MAX_CHARACTERS = 120;
