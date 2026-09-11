/**
 * The tone scale the dashboard card language paints with.
 *
 * Tone is a verdict, never decoration: a card is `danger` because something is
 * wrong, not because red looked good there. `cards.css` turns each tone into a
 * `--cc-tone` / `--cc-tone-soft` pair that descendants read.
 */

import type {
  OperationalStatus,
  OperationsSource,
} from '../../../shared/types.js';

export type Tone =
  | 'accent'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'success'
  | 'warning';

export function toneClass(tone: Tone | undefined): string {
  return `cc-tone-${tone ?? 'neutral'}`;
}

const STATUS_TONE: Record<OperationalStatus, Tone> = {
  critical: 'danger',
  degraded: 'warning',
  healthy: 'success',
  unknown: 'neutral',
};

export function statusTone(status: OperationalStatus | undefined): Tone {
  return STATUS_TONE[status ?? 'unknown'];
}

/**
 * Identity colour per signal source. The five Supabase-backed sources share one
 * colour because that is genuinely where they are read from; inventing five
 * distinct hues would imply five systems.
 */
const SOURCE_VAR: Record<OperationsSource, string> = {
  'cost-ledger': '--cc-src-supabase',
  'customer-economics': '--cc-src-supabase',
  fly: '--cc-src-fly',
  'github-actions': '--cc-src-github',
  posthog: '--cc-src-posthog',
  'product-health': '--cc-src-supabase',
  sentry: '--cc-src-sentry',
  'social-daemon': '--cc-src-supabase',
  'social-queue': '--cc-src-supabase',
};

export function sourceColorVar(source: OperationsSource): string {
  return `var(${SOURCE_VAR[source]})`;
}

const PLATFORM_VAR: Record<string, string> = {
  rednote: '--cc-src-rednote',
  threads: '--cc-src-threads',
  x: '--cc-src-x',
  youtube: '--cc-src-youtube',
};

export function platformColorVar(platform: string): string {
  const name = PLATFORM_VAR[platform];
  return name ? `var(${name})` : 'var(--ink-faint)';
}
