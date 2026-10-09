# Landing Page

Next.js 15 marketing site and MDX documentation for Zap Pilot.

## Stack

Next.js 15 (App Router, static export), React 19, Tailwind CSS v4, Fumadocs (MDX), Vitest.

## Setup

```bash
pnpm install        # postinstall runs fumadocs-mdx
pnpm dev            # http://localhost:3000
pnpm build          # → ./out (static)
```

## Content

- Home page: `@zapengine/zap-pilot-story/scenes` renders the engine, replay and join from story copy. `@zapengine/zap-pilot-story/brand` owns verbal identity. `src/config/messages.ts` owns metadata, waitlist, download and retained host surfaces; `/pitch` copy lives in `src/config/pitch.ts` and its cover reuses the story hero.
- Sharing: home and pitch use file-based `opengraph-image.tsx` routes and the shared `components/og/OgCard.tsx`. Packaged static fonts and token mark/status geometry render PNG cards with the self-hosting marker.
- Capability status: `packages/zap-pilot-story/src/facts/capabilities.ts` (`CAPABILITIES`) records whether each capability is Live, Research, In development or Planned. Copy references a capability id and pages render its `StatusBadge`; prose never states liveness. `src/config/__tests__/positioning.test.tsx` fences every claim, docs link and retired term.
- Docs: MDX files under `content/docs/` — rendered via Fumadocs. `<CapabilityStatusTable />` renders the status table on the docs home.

## Deploy

Static export (`output: 'export'` in `next.config.ts`) deployed to Vercel by the repo's deploy workflow.

See [AGENTS.md](./AGENTS.md) for test framework and port notes.
