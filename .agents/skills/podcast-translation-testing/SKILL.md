---
name: podcast-translation-testing
description: >-
  Use when changing or testing apps/podcast-pipeline translation behavior.
  Translation is OpenRouter-only with the code-owned openrouter/free router;
  malformed output or transient provider failures get one bounded retry, then
  fail closed.
---

# Podcast translation testing

## Core principle

**Treat provider success as unusable until every required translated field is present, non-empty for non-empty source input, and free of model chatter.**

The podcast pipeline translates only through OpenRouter using `openrouter/free`. There is no Google Translate fallback or secondary translation provider. A syntactically successful provider response can still be semantically unusable, so response validation remains an application responsibility.

For classroom generation, dual-HLS resume, and playback integrity, use
[podcast-audio-section-integrity](../podcast-audio-section-integrity/SKILL.md).

## Current implementation map

- `apps/podcast-pipeline/src/services/translate.ts`
  - `translateCanonicalScript({ title, script, targetLanguageCode })`
  - `translateChineseText(text, targetLanguageCode)`
  - model: code-owned `openrouter/free`
  - transport failures: judged by `isRetryableOpenRouterError` from `llm.ts` — one shared OpenRouter retry policy, not a second copy
  - response failures (`TranslationResponseError`): retried once with the rejection reason appended to the user message, then thrown
  - retries and the final failure log `translate:retry` / `translate:failed`, the latter carrying the spend already committed
  - empty source fields: preserved locally without a provider call
- `apps/podcast-pipeline/src/services/translate.test.ts` is the focused regression suite.

## High-value cases to cover first

1. OpenRouter returns valid JSON but omits a required field.
2. OpenRouter returns an empty translated value for a non-empty source field.
3. OpenRouter returns explanatory/model-chatter text instead of a pure translation.
4. OpenRouter returns malformed or non-object JSON.
5. Transient 429/5xx/timeout failures retry once and then succeed or fail closed.
6. Auth/configuration errors do not retry pointlessly.
7. Empty source fields remain empty; fully empty requests never call OpenRouter.
8. Translation cost uses OpenRouter `usage.cost`, including a completed but invalid response when a retry follows it.
9. A response-validation retry carries `Correction required: ...`; a transport retry does not.
10. `TRANSLATION_LLM_MODEL` is not part of the runtime contract; the router slug stays code-owned.

## Validation loop

Use the narrow suite first:

```bash
pnpm turbo run test --filter=@zapengine/podcast-pipeline -- --run src/services/translate.test.ts
```

Then run the workspace gate before handoff:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

If a change touches root config, shared packages, or CI inputs (this one touches `config/env.manifest.mjs`), run the root env tests and follow `monorepo-ci-debugging` before assuming podcast-only validation is enough.

## Rationalizations — STOP

| Excuse                                                            | Reality                                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "The provider returned HTTP 200, so the translation is valid."    | A successful response can still have missing, blank, malformed, or explanatory fields.                   |
| "We can silently call another provider if free routing fails."    | There is intentionally no fallback chain; retry once and fail visibly.                                   |
| "Retrying the same request is enough for a bad response."         | `temperature: 0` reproduces the same bad output. A response retry must tell the model what was rejected. |
| "The model should be configurable from env just in case."         | `openrouter/free` is a code-owned production behavior and changes through review/deploy.                 |
| "Empty title/script should still call the model for consistency." | Preserve empty source fields locally and avoid needless provider work.                                   |
