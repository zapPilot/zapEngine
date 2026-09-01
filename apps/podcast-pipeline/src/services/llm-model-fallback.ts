export const DEFAULT_LLM_FALLBACK_MODELS = [
  'minimax/minimax-m3:free',
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4-flash',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
] as const;

const MODELS_WITHOUT_JSON_RESPONSE_FORMAT = new Set<string>([
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);

/** Returns the configured primary model followed by the ordered fallback set. */
export function getOpenRouterModelCandidates(primaryModel: string): string[] {
  return [primaryModel.trim(), ...DEFAULT_LLM_FALLBACK_MODELS].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}

/**
 * Some fallback models can produce JSON when prompted but do not accept
 * OpenRouter's `response_format` parameter. Those still use the same parser and
 * Zod contract; we simply avoid making provider routing reject them up front.
 */
export function supportsJsonResponseFormat(model: string): boolean {
  return !MODELS_WITHOUT_JSON_RESPONSE_FORMAT.has(model);
}
