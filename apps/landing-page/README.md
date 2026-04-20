# Landing Page

Next.js 15 marketing site and MDX documentation for Zap Pilot.

## Stack

Next.js 15 (App Router, static export), React 19, Tailwind CSS v4, Framer Motion, Fumadocs (MDX), Vitest.

## Setup

```bash
pnpm install        # postinstall runs fumadocs-mdx
pnpm dev            # http://localhost:3000
pnpm build          # → ./out (static)
```

## Content

- Marketing sections: `src/components/` (Hero, Features, UseCases, etc.)
- Docs: MDX files under `src/app/docs/` — rendered via Fumadocs.

## Deploy

Static export (`output: 'export'` in `next.config.ts`) deployed to Vercel by the repo's deploy workflow.

See [CLAUDE.md](./CLAUDE.md) for test framework and port notes.
