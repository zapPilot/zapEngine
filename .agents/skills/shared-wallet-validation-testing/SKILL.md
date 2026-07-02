---
name: shared-wallet-validation-testing
description: >-
  Use when changing or testing wallet form validation shared through
  @zapengine/app-core, especially wallet invite email, wallet label, or Ethereum
  address behavior consumed by frontend/desktop wallet and bundle flows.
  Symptoms: app-core validation tests pass but frontend WalletManager tests fail,
  pasted input with leading/trailing whitespace, duplicated validation assertions
  across packages, or repeated PRs around validateEmail / validateNewWallet /
  walletValidation.test.ts.
---

# Shared wallet validation testing

## Core principle

**Treat `packages/app-core/src/utils/walletValidation.ts` as the contract, but verify at least one consumer package when the accepted/rejected behavior changes.**

Wallet validation is shared through `@zapengine/app-core`, yet frontend and desktop flows keep consumer-facing tests that can encode older UX expectations. A green app-core focused test can still leave CI red if a frontend WalletManager expectation was not updated with the new contract.

## Current implementation map

- Shared contract:
  - `packages/app-core/src/utils/walletValidation.ts`
  - `validateEmail(email)`
  - `validateNewWallet({ label, address })`
- Focused shared tests:
  - `packages/app-core/tests/utils/walletValidation.test.ts`
- Known consumer tests that import the shared helper:
  - `apps/frontend/tests/unit/utils/walletValidation.test.ts`
  - WalletManager component/unit tests around add-wallet form validation
- Lower-level address format helper:
  - `packages/app-core/src/lib/validation/walletUtils.ts`

## High-value cases to cover first

When changing wallet validation behavior, check these before broadening the PR:

1. Blank and whitespace-only values still return the required-field error.
2. Valid invite emails pasted with leading/trailing whitespace are accepted after trim.
3. Invalid email shapes remain rejected after trim.
4. Valid Ethereum addresses pasted with leading/trailing whitespace/newline are accepted after trim.
5. Malformed or missing `0x` wallet addresses remain rejected after trim.
6. Label validation runs before address validation, so a bad label does not leak an address error.
7. Consumer tests that import `@zapengine/app-core/utils/walletValidation` match the shared contract.

## Consumer-contract gotcha

The 2026-07-02 wallet validation Test QA run exposed this pattern twice:

1. Add a focused app-core test for accepting trimmed valid input.
2. Make the minimal shared implementation fix (`validateEmail` / `validateAddress` must validate the trimmed value).
3. CI then fails in a frontend WalletManager/unit expectation that still expects the same trimmed valid input to be invalid.

Lesson: when app-core validation acceptance changes, do not stop at the package test. Search for consumer tests importing the helper and update their expected UX contract in the same small PR.

## Validation loop

Start with the shared helper suite:

```bash
pnpm --filter @zapengine/app-core test -- walletValidation.test.ts
```

Then run the app-core workspace gate:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/app-core
```

If behavior changes from invalid → valid or valid → invalid, also run the frontend consumer test file or the named CI failure:

```bash
cd apps/frontend && pnpm exec vitest run tests/unit/utils/walletValidation.test.ts
```

Before merge, use the repo's CI-equivalent gate from `.github/workflows/ci.yml`:

```bash
pnpm verify ci
pnpm run security audit core
```

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The app-core helper test passed, so shared validation is done." | Consumer tests can encode the old UX contract and still fail CI. |
| "Trim is only an implementation detail." | For pasted wallet/email inputs, trim changes user-visible accepted/rejected behavior. |
| "The frontend test is redundant because it imports app-core." | It is a consumer-contract check; update it when the contract intentionally changes. |
| "Whitespace-invalid expectations are safer." | Blank whitespace remains invalid; valid pasted values should be tested after trim when the contract says so. |
