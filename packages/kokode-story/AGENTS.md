# Kokode story

Pure Kokode copy, locale data and narrative projections shared by the website, decks and film. No app, DOM, persistence or rendering dependencies.

- All Kokode copy lives in `src/`; consumers only render it.
- Keep the existing claim guardrails in `src/story.test.ts`. Fix copy when a guardrail fails; never widen it. No revenue-share numbers or wording in this public repository.
- Preserve locale contracts, narrative sequences and identifiers. Every demo must print its disclaimers.
- English film narration edits require regenerating narration; hero edits require regenerating Kokode OG cards.
- Verify through Turbo with the package and both consumers selected.
