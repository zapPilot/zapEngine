const MODELS_WITHOUT_JSON_RESPONSE_FORMAT = new Set<string>([
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);

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

export function getTranslationFallbackModels(
  value: string | undefined = process.env['TRANSLATION_FALLBACK_MODELS'],
): string[] {
  return parseOpenRouterModelList(value);
}

/** Returns the configured primary model followed by the env-owned fallback set. */
export function getOpenRouterModelCandidates(primaryModel: string): string[] {
  return [primaryModel.trim(), ...getOpenRouterFallbackModels()].filter(
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
