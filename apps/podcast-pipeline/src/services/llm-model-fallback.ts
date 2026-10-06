// LLM_MODEL is reserved for Podcast Script and Editorial Title. All other
// workloads use the free router primary and share LLM_FALLBACK_MODELS.
export const OPENROUTER_FREE_MODEL = 'openrouter/free';

export function parseOpenRouterModelList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(
      (model, index, all) => Boolean(model) && all.indexOf(model) === index,
    );
}

export function getOpenRouterFallbackModels(
  value: string | undefined = process.env['LLM_FALLBACK_MODELS'],
): string[] {
  return parseOpenRouterModelList(value);
}

/**
 * Every OpenRouter workload chooses its own primary model, then shares this one
 * ordered LLM_FALLBACK_MODELS list. Script and Title use LLM_MODEL; every
 * other workload uses OPENROUTER_FREE_MODEL as its primary.
 *
 * Operator contract: every entry must accept OpenRouter's
 * `response_format: { type: 'json_object' }` under the shared
 * `require_parameters` routing. JSON workloads send JSON mode unconditionally, so a
 * fallback that rejects it turns every JSON workload into a transport failure.
 */
export function getOpenRouterModelCandidates(primaryModel: string): string[] {
  return [primaryModel.trim(), ...getOpenRouterFallbackModels()].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}
