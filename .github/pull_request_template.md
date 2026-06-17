## Summary

<1-2 sentences: what changed and why>

## Changes

- <Concrete change>
- <Concrete change>

## Test Plan

- [ ] `pnpm verify` passes locally
- [ ] <App-specific verification, for example `pnpm --filter @zapengine/frontend test:unit`>
- [ ] <Manual verification, if any>

## Risk

<What could break? Include affected services and blast radius.>

## Rollback

<How to revert if this causes issues in production.>

## Checklist

- [ ] Followed conventions in the relevant `CLAUDE.md` files
- [ ] Updated `.env.example` if added env-var references
- [ ] If touching strategy or signal code: ran `pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast`
- [ ] If touching cross-service contracts: confirmed `pnpm contracts check` covers the change
