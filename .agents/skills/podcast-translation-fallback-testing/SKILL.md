---
name: podcast-translation-fallback-testing
description: >-
  Use when changing or testing apps/podcast-pipeline translation behavior,
  especially OpenRouter-first translation with Google Translate fallback.
  Symptoms: malformed OpenRouter JSON, missing or empty translated fields,
  empty canonical title/script fields, fallback cost mismatches, or repeated
  small PRs around translateCanonicalScript / translateChineseText edge cases.
---

# Podcast translation fallback testing

## Core principle

**Treat provider success as unusable until the required translated field is present, non-empty for non-empty source input, and not model chatter.**

The podcast pipeline intentionally translates through OpenRouter first and falls back to Google Translate for transient model/provider issues. A syntactically successful provider response can still be semantically unusable.

## Current implementation map

- `apps/podcast-pipeline/src/services/translate.ts`
  - `translateCanonicalScript({ title, script, targetLanguageCode })`
  - `translateChineseText(text, targetLanguageCode)`
  - OpenRouter path: JSON response, validated by `readTranslatedField`.
  - Google fallback path: `translateText`, which skips empty input without calling Google.
- `apps/podcast-pipeline/src/services/translate.test.ts` is the focused regression suite.

## High-value cases to cover first

For any translation behavior change, check these before adding broader tests:

1. OpenRouter returns valid JSON but omits a required field.
2. OpenRouter returns an empty translated value for a non-empty source field.
3. OpenRouter returns explanatory/model-chatter text instead of a pure translation.
4. Google Translate returns `ok: true` but `translatedText` is missing, not a string, or blank.
5. `translateCanonicalScript` has mixed empty inputs:
   - empty `title`, non-empty `script` → only one Google request, empty title preserved;
   - non-empty `title`, empty `script` → only one Google request, empty script preserved;
   - both empty → no OpenRouter or Google request.
6. Google fallback cost uses the total source character count that actually went through Google, not the number of fields.

## Cost gotcha

Google cost is `charCount * 0.00002` in `buildGoogleTranslateCostLine`. For canonical title/script fallback, the cost is based on `translatedTitle.charCount + translatedScript.charCount`.

Do not assume one translated field means `0.00002`. Count the exact source characters. Example: `標題` is 2 characters, so expected cost is `0.00004`.

## Validation loop

Use the narrow suite first:

```bash
pnpm --filter @zapengine/podcast-pipeline test -- translate.test.ts
```

Then run the workspace gate before handoff:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/podcast-pipeline
```

If a PR changes root config, shared packages, or CI inputs, also follow `monorepo-ci-debugging` before assuming podcast-only validation is enough.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The provider returned HTTP 200, so the translation is valid." | A successful response can still have missing or blank fields. Validate shape and content. |
| "Only one field is non-empty, so the cost should be one unit." | Cost is character-based, not field-based. Count source characters. |
| "Empty title/script should still go through Google for consistency." | `translateText('')` intentionally preserves empty input and skips provider calls. |
| "This is just another edge-case test." | Fallback behavior protects user-facing podcast scripts from blank localized content. |
