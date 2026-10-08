See @../AGENTS.md for shared package rules.

# Story engine

- The root entry is pure TypeScript. React, DOM and browser drivers belong in `src/react` and the `./react` entry.
- No product copy, facts, brand geometry or colors. Theme only through `--sk-*` variables.
- Scene time is story time. Narration holds belong to the clock/story map, never scene logic.
- Preserve the Motion/Film design's word stagger, previous-stop tolerance and 900ms deck tween.
- Keep all source coverage dimensions at 100%; validate cuts and arcs before rendering.
