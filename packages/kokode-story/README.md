# Kokode story

`@zapengine/kokode-story` owns the copy, locales and narrative sequences consumed by Kokode's landing page, web decks and the `kokode-clinic` film. It has no runtime dependencies. Exports are built JavaScript and declarations in `dist/`; consumers declare `workspace:*` dependencies.

Run from the repository root:

```sh
pnpm turbo run type-check test --filter=@zapengine/kokode-story --filter=@zapengine/kokode-ai --filter=@zapengine/video
```

Turbo builds dependencies and tracks story edits through both consumers. Before using raw media or development commands on a clean checkout, build their dependencies through Turbo (`pnpm turbo run build '--filter=@zapengine/video^...' '--filter=@zapengine/kokode-ai^...'`). The root sales render/publish launchers do this automatically.

Change copy here; never duplicate it in a renderer. Claim guardrails move with the copy in `src/story.test.ts`. English narration edits still require voiceover refresh, and hero edits require Kokode OG refresh. `formForPage(lang)` accepts the document language from its browser caller and does not read the DOM itself.

The duplication check excludes the three locale directories: they intentionally repeat the same typed copy matrices and identifiers so each translation is independently editable. Locale-contract tests enforce that shared structure. Executable projections, narrative validation, language selection and footnote formatting remain checked; the footnote formatting algorithm has one shared implementation in `src/footnote.ts`.
