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
 * ordered fallback list. Translation is the only workload whose primary is not
 * `LLM_MODEL` (`openrouter/free`), but it still falls back through this list.
 *
 * Operator contract: every entry must accept OpenRouter's
 * `response_format: { type: 'json_object' }` under the shared
 * `require_parameters` routing. Callers send JSON mode unconditionally, so a
 * fallback that rejects it turns every JSON workload into a transport failure.
 */
export function getOpenRouterModelCandidates(primaryModel: string): string[] {
  return [primaryModel.trim(), ...getOpenRouterFallbackModels()].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}
