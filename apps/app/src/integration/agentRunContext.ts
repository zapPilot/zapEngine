/**
 * The news agent has no backend of its own, so the story it read and Laya's
 * analysis of it travel in the dashboard link it prints and sends to Telegram
 * (`/ai-wallet?episode=…&hack=…&eth=…&upward=…`). Transactions are always read
 * from chain; only this descriptive context comes from the URL.
 */

export const LAYA_PRESSURES = ['upward', 'downward', 'none'] as const;
export type LayaPressure = (typeof LAYA_PRESSURES)[number];

export interface LayaAnalysis {
  exchangeHack: number;
  pressure: LayaPressure;
  probabilities: Partial<Record<LayaPressure, number>>;
}

export interface AgentRunContext {
  episodeId: string | null;
  analysis: LayaAnalysis | null;
}

type SearchParams = Partial<Record<string, string | string[]>>;

const EPISODE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function probability(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

export function parseAgentRunContext(params: SearchParams): AgentRunContext {
  const episode = single(params['episode']);
  const exchangeHack = probability(single(params['hack']));
  const eth = single(params['eth']);
  const pressure = LAYA_PRESSURES.find((value) => value === eth);
  const probabilities: Partial<Record<LayaPressure, number>> = {};
  for (const key of LAYA_PRESSURES) {
    const value = probability(single(params[key]));
    if (value !== null) probabilities[key] = value;
  }
  return {
    episodeId:
      episode !== undefined && EPISODE_ID_PATTERN.test(episode)
        ? episode
        : null,
    analysis:
      exchangeHack !== null && pressure !== undefined
        ? { exchangeHack, pressure, probabilities }
        : null,
  };
}
