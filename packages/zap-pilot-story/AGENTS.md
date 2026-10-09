See @../AGENTS.md for shared package rules.

# Zap Pilot story

- Facts, capability claims and scene models belong here. Hosts may route, measure and collect forms; they must not invent product facts.
- `src/facts/data/replay-2026-10-05.json` is pinned independently of the rolling landing datasets. Regenerate with `pin:replay`; never edit by hand.
- Shared capability status lives in `src/facts/capability-status.ts` (`./status`), and `CAPABILITIES` consumes that map. The status entry is safe for read-only iOS and must remain free of promotional detail or protocol names. A status change must break typed claims that no longer match it.
- Read the persuasive-messaging skill before changing promotional copy. Preserve the pre-sign, device-key, custody and backtest boundaries.
- Models consume story time; output duration/voice holds belong to story-kit time maps.

- `./brand` is a browser-free entry dependent only on capability facts. Brand words are canonical English; hosts do not rewrite them, except the comma-joined spoken slogan in podcast outros. `./copy` owns product messaging and chips.
- When self-hosting changes status, revise typed planned claims, flip `SELF_HOSTING_STATUS` (design-tokens `scripts/brand.mjs`) and `SELF_HOSTING_LABEL` (`scripts/fonts.py`), update the hand-written one-liners in `README.md` and `apps/landing-page/content/docs/index.mdx`, regenerate glyphs/lockups/podcast sign-off assets and home/pitch OG cards, and add a new frozen podcast packaging version. Preserve existing audio and snapshots.
