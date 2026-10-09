See @../AGENTS.md for shared package rules.

# Zap Pilot story

- Facts, capability claims and scene models belong here. Hosts may route, measure and collect forms; they must not invent product facts.
- `src/facts/data/replay-2026-10-05.json` is pinned independently of the rolling landing datasets. Regenerate with `pin:replay`; never edit by hand.
- Shared capability status lives in `src/facts/capability-status.ts` (`./status`), and `CAPABILITIES` consumes that map. The status entry is safe for read-only iOS and must remain free of promotional detail or protocol names. A status change must break typed claims that no longer match it.
- Read the persuasive-messaging skill before changing promotional copy. Preserve the pre-sign, device-key, custody and backtest boundaries.
- Models consume story time; output duration/voice holds belong to story-kit time maps.
