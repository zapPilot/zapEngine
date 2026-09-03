---
name: podcast-translation-testing
description: >-
  Use when changing or testing apps/podcast-pipeline translation behavior.
  Translation is OpenRouter-only: the code-owned openrouter/free router runs
  first, then the paid models in TRANSLATION_FALLBACK_MODELS; each model gets
  one bounded retry, auth/config errors fail immediately, and the run fails
  closed after the last candidate.
---

# Podcast translation testing

## Core principle

**Treat provider success as unusable until every required translated field is present, non-empty for non-empty source input, and free of model chatter.**

The podcast pipeline translates only through OpenRouter. `openrouter/free` is always the first model; `TRANSLATION_FALLBACK_MODELS` (a non-secret, comma-separated list in `config/env/{dev,prod}.env`) names the paid OpenRouter models tried after it, in order. There is no Google Translate fallback or other secondary provider. A syntactically successful provider response can still be semantically unusable, so response validation remains an application responsibility.

For classroom generation, dual-HLS resume, and playback integrity, use
[podcast-audio-section-integrity](../podcast-audio-section-integrity/SKILL.md).

## Current implementation map

- `apps/podcast-pipeline/src/services/translate.ts`
  - `translateCanonicalScript({ title, script, targetLanguageCode })`
  - `translateChineseText(text, targetLanguageCode)`
  - model order: code-owned `openrouter/free`, then `getTranslationFallbackModels()` from `llm-model-fallback.ts` (env `TRANSLATION_FALLBACK_MODELS`, trimmed and deduplicated)
  - canonical scripts over 2,000 characters: split by paragraph, then sentence boundary, then hard cap; translated sequentially and rejoined with blank lines
  - transport failures: judged by `isRetryableOpenRouterError` from `llm.ts` — one shared OpenRouter retry policy, not a second copy
  - transport retry drops deterministic throughput sorting via `OPENROUTER_FALLBACK_ROUTING`; response-validation retry keeps the normal route and adds correction context
  - per model (`tryTranslationModel`): `TRANSLATION_MAX_ATTEMPTS = 2`; a retryable transport failure or `TranslationResponseError` still present after the second attempt advances to the next candidate and logs `translate:model-fallback`; a non-retryable error (auth/config) is thrown immediately without touching the paid models
  - response failures (`TranslationResponseError`): retried once on the same model with the rejection reason appended to the user message; the next model starts without that correction context
  - retries, model switches, and the final failure log `translate:retry` / `translate:model-fallback` / `translate:failed`, the latter carrying the spend already committed across every model tried
  - empty source fields: preserved locally without a provider call
- `apps/podcast-pipeline/src/services/translate.test.ts` is the focused regression suite; `translate-paid-fallback.test.ts` covers free → paid escalation and the 401 fast-fail, and `llm-model-fallback.test.ts` covers env list parsing.

## High-value cases to cover first

1. OpenRouter returns valid JSON but omits a required field.
2. OpenRouter returns an empty translated value for a non-empty source field.
3. OpenRouter returns explanatory/model-chatter text instead of a pure translation.
4. OpenRouter returns malformed or non-object JSON.
5. Transient 429/5xx/timeout failures retry once on the current model, then fall through to the next model in `TRANSLATION_FALLBACK_MODELS`; the run fails closed only after the last candidate.
6. Auth/configuration errors do not retry pointlessly and never advance to a paid fallback model.
7. Empty source fields remain empty; fully empty requests never call OpenRouter.
8. Translation cost uses OpenRouter `usage.cost`, including a completed but invalid response when a retry follows it.
9. A response-validation retry carries `Correction required: ...`; a transport retry does not.
10. `TRANSLATION_LLM_MODEL` is not part of the runtime contract; the first model stays code-owned `openrouter/free`, and only the fallback list (`TRANSLATION_FALLBACK_MODELS`) is env-configurable.
11. Multi-chunk scripts send the title only with the first chunk, preserve chunk order, and aggregate every chunk's actual provider/model cost.
12. Paragraphs are preferred boundaries; oversized paragraphs fall back to complete sentences, and only an oversized single sentence is hard-sliced at 2,000 characters.
13. Cost aggregation includes every billed attempt across models, including a billed-but-unusable free response that preceded the paid success.

## Validation loop

Use the narrow suite first:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/translate.test.ts src/services/translate-paid-fallback.test.ts src/services/llm-model-fallback.test.ts
```

Then run the workspace gate before handoff:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

If a change touches root config, shared packages, or CI inputs (this one touches `config/env.manifest.mjs`), run the root env tests and follow `monorepo-ci-debugging` before assuming podcast-only validation is enough.

## Rationalizations — STOP

| Excuse                                                            | Reality                                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The provider returned HTTP 200, so the translation is valid."    | A successful response can still have missing, blank, malformed, or explanatory fields.                                                                                |
| "We can silently call another provider if free routing fails."    | The only fallback is the ordered paid OpenRouter list in `TRANSLATION_FALLBACK_MODELS`; every switch logs `translate:model-fallback`, and there is no other provider. |
| "Retrying the same request is enough for a bad response."         | `temperature: 0` reproduces the same bad output. A response retry must tell the model what was rejected.                                                              |
| "The model should be configurable from env just in case."         | The first model stays code-owned `openrouter/free`; deploy-time policy lives only in the reviewed fallback list in `config/env/*.env`.                                |
| "Empty title/script should still call the model for consistency." | Preserve empty source fields locally and avoid needless provider work.                                                                                                |
