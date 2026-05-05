See @README.md for project overview.

# Gotchas

- Uses **Vitest** — `pnpm test`
- `postinstall` runs `fumadocs-mdx` automatically; re-run `pnpm install` if MDX types are missing
- Documentation content lives in MDX files under `content/docs/`
- Deployed to Vercel as static export (`output: 'export'` in next.config.ts)
- `pnpm dev` starts on port 3000 — conflicts with frontend dev server if both run simultaneously
