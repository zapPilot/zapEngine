# Pitch Deck

Static Markdown pitch deck for Zap Pilot. It is designed for local preview and GitHub Pages deployment while keeping the story close to the landing page narrative.

## Stack

Plain HTML, Reveal.js from CDN, external Markdown slides.

## Development

```bash
pnpm --filter @zapengine/pitch-deck dev
```

Open <http://localhost:3010>.

## Content

- Shell and styling: `site/index.html`
- Slides: `site/slides/deck.md`
- Static assets: `site/assets/`

Keep core claims and wording aligned with `apps/landing-page/src/config/messages.ts`.

## Deploy

`.github/workflows/deploy-pitch-deck.yml` builds `apps/pitch-deck/out` from `apps/pitch-deck/site` and publishes the artifact to GitHub Pages on pushes to `main` that touch the deck.
