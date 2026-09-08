import { errorMessage } from '../../lib/errorMessage.js';

export const VISUAL_FAILURE_DIAGNOSTICS_SCHEMA_VERSION =
  'podcast-episode-visual-failure.v1' as const;

export type VisualFailureStage =
  | 'analyze-audio'
  | 'storyboard'
  | 'branding'
  | 'search-intents'
  | 'scrape-article'
  | 'plan-assets'
  | 'write-manifest'
  | 'upload';

export interface VisualFailureDiagnostics {
  schemaVersion: typeof VISUAL_FAILURE_DIAGNOSTICS_SCHEMA_VERSION;
  visualVersion: string;
  runId: string;
  attempt: number;
  failedAt: string;
  stage: VisualFailureStage;
  message: string;
  snapshot?: Record<string, unknown>;
}

export class VisualPlanningError extends Error {
  readonly diagnostics: VisualFailureDiagnostics;

  constructor(cause: unknown, diagnostics: VisualFailureDiagnostics) {
    super(errorMessage(cause), { cause });
    this.name = 'VisualPlanningError';
    this.diagnostics = diagnostics;
  }
}

export function buildVisualFailureDiagnostics(input: {
  visualVersion: string;
  runId: string;
  attempt: number;
  stage: VisualFailureStage;
  error: unknown;
  snapshot?: Record<string, unknown>;
}): VisualFailureDiagnostics {
  return {
    schemaVersion: VISUAL_FAILURE_DIAGNOSTICS_SCHEMA_VERSION,
    visualVersion: truncate(input.visualVersion, 120),
    runId: truncate(input.runId, 120),
    attempt: Math.max(0, Math.trunc(input.attempt)),
    failedAt: new Date().toISOString(),
    stage: input.stage,
    message: truncate(errorMessage(input.error), 4000),
    ...(input.snapshot ? { snapshot: sanitizeSnapshot(input.snapshot) } : {}),
  };
}

export function visualFailureDiagnosticsFor(
  error: unknown,
): VisualFailureDiagnostics | null {
  return error instanceof VisualPlanningError ? error.diagnostics : null;
}

function sanitizeSnapshot(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const serialized = JSON.stringify(value, snapshotReplacer);
  const clipped =
    serialized.length > 32_000 ? serialized.slice(0, 32_000) : serialized;
  try {
    const parsed: unknown = JSON.parse(clipped);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { summary: truncate(serialized, 31_000) };
  } catch {
    return { summary: truncate(serialized, 31_000) };
  }
}

function snapshotReplacer(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();
  if (
    normalized.includes('script') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key')
  ) {
    return '[redacted]';
  }
  if (typeof value === 'string') return truncate(value, 2000);
  if (Array.isArray(value)) return value.slice(0, 256);
  return value;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}
