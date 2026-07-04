---
name: shared-wallet-validation-testing
description: >-
  Use when changing or testing wallet form validation shared through
  @zapengine/app-core, especially wallet invite email, wallet label, or Ethereum
  address behavior consumed by app wallet and bundle flows.
  Symptoms: app-core validation tests pass but app consumer tests fail,
  pasted input with leading/trailing whitespace, duplicated validation assertions
  across packages, or repeated PRs around validateEmail / validateNewWallet /
  walletValidation.test.ts.
---

# Shared wallet validation testing

## Core principle

**Treat `packages/app-core/src/utils/walletValidation.ts` as the contract, but verify at least one consumer package when the accepted/rejected behavior changes.**

Wallet validation is shared through `@zapengine/app-core`. A green app-core
focused test can still leave CI red if an app consumer expectation encodes an
older UX contract.

## Current implementation map

- Shared contract:
  - `packages/app-core/src/utils/walletValidation.ts`
  - `validateEmail(email)`
  - `validateNewWallet({ label, address })`
- Focused shared tests:
  - `packages/app-core/tests/utils/walletValidation.test.ts`
- Known consumer tests that import the shared helper:
  - None currently; search `apps/app` when app UI adds consumer-level wallet tests.
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

When app-core validation acceptance changes (invalid → valid or valid → invalid),
CI can fail in a _consumer_ test — typically an app wallet/unit
expectation that still encodes the old contract — even though the app-core suite
is green.

Rule: do not stop at the package test. Search for consumer tests importing the
helper and update their expected UX contract in the same small PR.

## Validation loop

Start with the shared helper suite:

```bash
pnpm --filter @zapengine/app-core test -- walletValidation.test.ts
```

Then run the app-core workspace gate:

```bash
pnpm turbo run type-check lint test --filter=@zapengine/app-core
```

If behavior changes from invalid → valid or valid → invalid, also run any app
consumer test file or the named CI failure:

```bash
rg -n "walletValidation|validateNewWallet|validateEmail" apps/app packages/app-core
```

Before merge, use the repo's CI-equivalent gate from `.github/workflows/ci.yml`:

```bash
pnpm verify ci
pnpm run security audit core
```

## Rationalizations — STOP

| Excuse                                                            | Reality                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "The app-core helper test passed, so shared validation is done."  | Consumer tests can encode the old UX contract and still fail CI.                                             |
| "Trim is only an implementation detail."                          | For pasted wallet/email inputs, trim changes user-visible accepted/rejected behavior.                        |
| "The app consumer test is redundant because it imports app-core." | It is a consumer-contract check; update it when the contract intentionally changes.                          |
| "Whitespace-invalid expectations are safer."                      | Blank whitespace remains invalid; valid pasted values should be tested after trim when the contract says so. |
