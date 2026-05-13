See @README.md for project overview and @package.json for available scripts.

# Gotchas

- The deck is intentionally static: no npm dependencies, no build output, no TypeScript.
- `site/index.html` loads Reveal.js from a CDN and renders `site/slides/deck.md`.
- Do not add YAML frontmatter to `deck.md`; Reveal uses `---` as a slide separator.
- Keep investor narrative aligned with `apps/landing-page/src/config/messages.ts`.
- Local preview requires a web server because the Reveal Markdown plugin fetches the external Markdown file.
