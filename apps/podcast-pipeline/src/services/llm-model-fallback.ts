export const DEFAULT_LLM_FALLBACK_MODELS = [
  'minimax/minimax-m3:free',
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4-flash',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
] as const;

/**
 * Returns the configured primary model followed by ordered fallback models.
 *
 * `LLM_FALLBACK_MODELS` is optional and comma-separated so operations can
 * override the checked-in fallback order without changing the primary
 * `LLM_MODEL`. Empty entries and duplicates are ignored.
 */
export function getOpenRouterModelCandidates(
  primaryModel: string,
  rawFallbackModels: string | undefined = process.env['LLM_FALLBACK_MODELS'],
): string[] {
  const fallbackModels = rawFallbackModels
    ? rawFallbackModels
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean)
    : [...DEFAULT_LLM_FALLBACK_MODELS];

  return [primaryModel.trim(), ...fallbackModels].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}
