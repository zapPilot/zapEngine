# Story kit

Product-independent story time, kinetic type and playback. The root entry has no
React or browser dependency; `@zapengine/story-kit/react` supplies server-safe
markup and client drivers. Import `@zapengine/story-kit/styles.css` once in a host.

A product owns its facts, copy, scenes, arc and cuts. Hosts pass a validated `Cut`
and `render(time)` to `StoryPlayer`. Film and deck share story time; narration
holds translate clock time using `holdMap`, `storyAt` and `clockAt`. Holds never
change scene models. `clockAt` defaults to arrival at a hold; use `departure`
when scheduling what follows it.

The player uses 900ms eased transitions, a 0.3-second previous-stop tolerance,
30ms frame throttling, reduced-motion posters, scoped keyboard controls and
`#slide-NN` links. Before printing it mounts one fixed stage per stop. Final
publication PDFs should use rendered stills to preserve browser 3D fidelity.

Set `--sk-ground`, `--sk-sheet`, `--sk-ink`, `--sk-ink-3`, `--sk-rule`,
`--sk-sign-ink`, `--sk-radius-control`, `--sk-font-mono` and `--sk-easing-scene`
from a host's theme. The kit never imports product design tokens.

Verify from the repository root:

```bash
pnpm turbo run build type-check lint test:coverage deadcode format:check --filter=@zapengine/story-kit
```
