See @README.md for project overview.

# Gotchas

- Uses **Jest** (not Vitest) — `pnpm test`, not `pnpm test:unit`
- `postinstall` runs `fumadocs-mdx` automatically; re-run `pnpm install` if MDX types are missing
- Documentation content lives in MDX files under `src/app/docs/`
- Deployed to Vercel as static export (`output: 'export'` in next.config.ts)
- `pnpm dev` starts on port 3000 — conflicts with frontend dev server if both run simultaneously
