export const DEFAULT_LLM_FALLBACK_MODELS = [
  'minimax/minimax-m3:free',
  'z-ai/glm-5.3-flash',
  'deepseek/deepseek-v4-flash',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
] as const;

/** Returns the configured primary model followed by the ordered fallback set. */
export function getOpenRouterModelCandidates(primaryModel: string): string[] {
  return [primaryModel.trim(), ...DEFAULT_LLM_FALLBACK_MODELS].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}
