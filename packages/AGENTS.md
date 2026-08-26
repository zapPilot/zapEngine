# Internal packages

Read this file for shared package rules, then the nearest scoped instruction file for package-specific boundaries and gotchas.

## Build and verification

Internal packages are built through Turbo's dependency graph. Run focused tasks from the repository root:

```bash
pnpm turbo run <task> --filter=<workspace>
```

Do not use direct filtered `type-check`, `lint`, or `test` commands when a package depends on another internal package. They can bypass `^build` and read stale or missing `dist` output.

Use `pnpm build packages` only when a raw script bypasses Turbo or when all package output must be rebuilt explicitly.

## Package boundaries

- Keep packages focused and framework-independent unless the package exists for a specific runtime.
- Depend downward only; do not introduce app-to-package cycles or package knowledge of app identity and persistence concerns.
- Public wire-contract schemas and types belong in `@zapengine/types`.
- Transaction intent normalization belongs in `@zapengine/intent-engine`; analytics and identity knowledge do not.

## Verification

Use the repository root verification policy. The package-specific aggregate
commands are:

```bash
pnpm verify changed
pnpm verify branch
```
