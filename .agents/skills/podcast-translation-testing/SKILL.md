---
name: podcast-translation-testing
description: >-
  Use when changing or testing apps/podcast-pipeline translation behavior.
  Translation is OpenRouter-only: the code-owned openrouter/free model is the
  primary, transport failures use the shared LLM_FALLBACK_MODELS chain, and
  payload validation remains owned by translation.
---

# Podcast translation testing

## Core principle

**Treat provider success as unusable until every required translated field is present, non-empty for non-empty source input, and free of model chatter.**

The podcast pipeline translates only through OpenRouter. `openrouter/free` is always the translation primary. The shared, non-secret `LLM_FALLBACK_MODELS` list in `config/env/{dev,prod}.env` is the only model fallback list for translation and every other OpenRouter workload. There is no `TRANSLATION_FALLBACK_MODELS`, Google Translate fallback, or other secondary provider. A syntactically successful provider response can still be semantically unusable, so response validation remains an application responsibility.

For classroom generation, dual-HLS resume, and playback integrity, use
[podcast-audio-section-integrity](../podcast-audio-section-integrity/SKILL.md).

## Current implementation map

- `apps/podcast-pipeline/src/services/translate.ts`
  - `translateCanonicalScript({ title, script, targetLanguageCode })`
  - `translateChineseText(text, targetLanguageCode)`
  - primary model: code-owned `openrouter/free`
  - transport model order: `openrouter/free`, then `getOpenRouterModelCandidates()` appends `LLM_FALLBACK_MODELS` in reviewed order with duplicates removed
  - canonical scripts over 2,000 characters: split by paragraph, then sentence boundary, then hard cap; translated sequentially and rejoined with blank lines
  - transport failures are handled by `createOpenRouterChatCompletion()` in `llm.ts`: timeout, connection failure, 408/409/429, or 5xx advances through the shared model chain; auth/config/client failures remain terminal
  - translation keeps `TRANSLATION_MAX_ATTEMPTS = 2` around the shared request. `TranslationResponseError` retries with correction context; a retryable transport error can only reach this layer after the shared model chain has already been exhausted
  - a transport retry uses `OPENROUTER_FALLBACK_ROUTING`; a response-validation retry keeps the normal route and adds the rejection reason
  - empty source fields are preserved locally without a provider call
  - the final failure log carries the spend already committed by completed attempts
- `apps/podcast-pipeline/src/services/llm-shared-model-fallback.test.ts` owns the shared transport/model-chain regression coverage.
- `apps/podcast-pipeline/src/services/translate.test.ts` and `translate-paid-fallback.test.ts` own translation-specific response and `openrouter/free` primary coverage.

## High-value cases to cover first

1. OpenRouter returns valid JSON but omits a required field.
2. OpenRouter returns an empty translated value for a non-empty source field.
3. OpenRouter returns explanatory/model-chatter text instead of a pure translation.
4. OpenRouter returns malformed or non-object JSON.
5. A transient transport/provider failure advances from `openrouter/free` through `LLM_FALLBACK_MODELS`; the run fails closed only after the shared chain and bounded translation retry are exhausted.
6. Auth/configuration errors do not retry pointlessly and never advance to another model.
7. Empty source fields remain empty; fully empty requests never call OpenRouter.
8. Translation cost uses OpenRouter `usage.cost`, including a completed but invalid response when a retry follows it.
9. A response-validation retry carries `Correction required: ...`; a transport retry does not.
10. `TRANSLATION_LLM_MODEL` and `TRANSLATION_FALLBACK_MODELS` are not part of the runtime contract; translation primary stays code-owned `openrouter/free`, and deploy-time fallback policy is the shared `LLM_FALLBACK_MODELS` list.
11. Multi-chunk scripts send the title only with the first chunk, preserve chunk order, and aggregate every chunk's actual provider/model cost.
12. Paragraphs are preferred boundaries; oversized paragraphs fall back to complete sentences, and only an oversized single sentence is hard-sliced at 2,000 characters.

## Validation loop

Use the narrow suite first:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/translate.test.ts src/services/translate-paid-fallback.test.ts src/services/llm-model-fallback.test.ts src/services/llm-shared-model-fallback.test.ts
```

Then run the workspace gate before handoff:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

If a change touches root config, shared packages, or CI inputs, run the root env tests and follow `monorepo-ci-debugging` before assuming podcast-only validation is enough.

## Rationalizations — STOP

| Excuse                                                            | Reality                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| "The provider returned HTTP 200, so the translation is valid."    | A successful response can still have missing, blank, malformed, or explanatory fields.                                     |
| "We can silently call another provider if free routing fails."    | Model failover stays inside OpenRouter and uses only the shared `LLM_FALLBACK_MODELS` policy; there is no second provider. |
| "Retrying the same request is enough for a bad response."         | `temperature: 0` reproduces the same bad output. A response retry must tell the model what was rejected.                   |
| "Translation needs its own model envs just in case."              | Translation primary is code-owned `openrouter/free`; every OpenRouter workload shares `LLM_FALLBACK_MODELS`.               |
| "Empty title/script should still call the model for consistency." | Preserve empty source fields locally and avoid needless provider work.                                                     |
