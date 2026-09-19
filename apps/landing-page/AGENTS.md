See @README.md for project overview.

# Gotchas

- Uses **Vitest** — `pnpm test`
- `postinstall` runs `fumadocs-mdx` automatically; re-run `pnpm install` if MDX types are missing
- Documentation content lives in MDX files under `content/docs/`
- Deployed to Vercel as static export (`output: 'export'` in next.config.ts)
- `pnpm dev` starts on port 3000 — pass `--port` if another dev server already holds it

## Track-record invariants

- The track-record page defaults to committed backtest data (`src/data/track-record-source.ts`). Live IPFS is an explicit reader opt-in; publishing a live snapshot does not replace the default backtest view.
- `test:strategy-snapshot:fast` uses the committed fixture's `reference_date`, not the wall clock. Only the refresh workflow advances that date. Regenerating fixtures changes landing-page numbers; do not change expected values merely to make the gate pass.

- `/discord/` is a client hop in the static export. Do not replace it with a Vercel 30x rule: that would bypass analytics.
- `first_touch_utm_*` and the waitlist POST share the same localStorage first-touch record, captured during client instrumentation.
