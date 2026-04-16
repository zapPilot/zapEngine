# Pre-commit Quality Gate Fixes

## Failure 1: Missing `useTelegramConnection` hooks

- **Cause**: `NotificationChannels.tsx` depends on hooks that are not present in the codebase.
- **Fix**: Re-implement `useTelegramConnection.ts` in `src/hooks/queries/` and update the import.
- **Implemented Hooks**:
  - `useTelegramStatus(userId)`: Fetches connection status.
  - `useTelegramConnect()`: Mutation to get verification token and deep link.
  - `useTelegramDisconnect()`: Mutation to disconnect.
- **New Location**: `src/hooks/queries/useTelegramConnection.ts`
- **Updated Component**:
  `src/components/wallet/portfolio/views/strategy/components/suggestion/NotificationChannels.tsx`

## Pending Checks

- `npm run deadcode:check`
- `npm run lint`
- `npm run dup:check`
- `npm run test:safeall`
