---
name: analytics-engine-ci-debugging
description: >-
  Use when the @zapengine/analytics-engine (Python / uv / FastAPI) CI checks
  fail — `format:check` failing on whitespace though `ruff check` / lint-staged
  was clean (ruff's linter and formatter are separate tools), a mypy strict
  missing-annotation error, a `dup:check` jscpd clone (incl. an expired
  duplicate-quarantine), or `contracts check` zod↔pydantic parity drift.
  Symptoms: "ruff check passed so formatting is fine", "the pre-commit hook
  passed so format is fine", reaching for `# type: ignore` / `# noqa` to silence
  a gate, bumping the jscpd threshold. The TS lint-format-loop skill does NOT
  cover Python — this one does.
---

# analytics-engine CI debugging (Python / uv)

## Where the error already is

Don't re-discover the failure — it's already captured. A local `pnpm verify
parallel` (or `verify changed`) writes `.ai-verify/result.json` (per-job status)
plus one log per job under `.ai-verify/logs/`. Read `result.json`, find the
failed job, then read its log. analytics-engine failures surface across several
core jobs:

- **`format`** (ruff format), **`lint`** (ruff check + mypy), **`contracts`**
  (zod↔pydantic), **`dup`** (jscpd), and **`analytics`** (sql:audit /
  service-reachability / pylint) → the matching `.ai-verify/logs/<job>.log`

That log holds the full error. The per-gate commands below are for re-running a
single gate once you've located it — not the entry point.

## Core principle

analytics-engine is Python/uv but exposes the **same `pnpm <script>` surface** as
the TS apps (`format`, `format:check`, `lint`, `type-check`, `test:ci`,
`dup:check`) — each wraps `uv run …`. The traps are different from the JS side,
and the most common one is that **ruff is two independent tools**: `ruff check`
(linter) and `ruff format` (formatter) do not imply each other.

## The flagship trap — `ruff check` ≠ `ruff format`

Burned `651d7ec1` (and the cleanup `961f7186`).

- **Symptom:** `lint` / lint-staged / `ruff check` is green, but CI `format:check`
  fails on whitespace or line-wrap — e.g. a 1-char identifier rename let two
  arguments collapse onto a single line under the 88-col limit; the linter never
  flagged it, the formatter did.
- **Mechanism + footgun:** the scripts in
  [apps/analytics-engine/package.json](../../../apps/analytics-engine/package.json):
  ```jsonc
  "lint":         "uv run ruff check src tests && uv run mypy src",
  "format":       "uv run ruff format src tests",
  "format:check": "uv run ruff format --check src tests",
  ```
  CI's `format:check` runs the **formatter** in check mode. Crucially,
  **lint-staged on `.py` runs only `ruff check --fix`** (root `package.json`
  `lint-staged`) — it does **not** run `ruff format`. So formatter drift sails
  through the pre-commit hook and is caught only by CI.
- **Fix:** before pushing, run the formatter explicitly:
  ```bash
  pnpm --filter @zapengine/analytics-engine run format        # writes
  pnpm --filter @zapengine/analytics-engine run format:check  # what CI runs
  ```
  Conform to what `ruff format` produces; don't hand-wrap to guess the canonical
  form (let the tool show you, like the [monorepo-lint-format-loop](../monorepo-lint-format-loop/SKILL.md)
  principle, but for Python).

## The other Python gates — triage

| Failing check | Command (wraps `uv run`) | Action |
| --- | --- | --- |
| `type-check` / `lint`'s mypy half | `mypy src` (strict) | Every function needs annotations. **Add the real types** — don't `# type: ignore` to silence it. |
| `dup:check` | jscpd on `src` | Merge the clone, or `jscpd:ignore` an intentional one with a reason; a dated dup-quarantine that lapsed must be eliminated, not re-quarantined (`2decbc0e` → `58514fb9`). → **monorepo-dup-check** owns the jscpd mechanism repo-wide. |
| `contracts check` | `pnpm contracts check` | zod↔pydantic parity. It runs `build packages` then exports the zod schemas via raw `tsx` (bypasses turbo, hence the explicit prebuild) and diffs against the pydantic models. Fix whichever side drifted — the zod schema in `@zapengine/types` or the pydantic model. |
| `pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine` | `sql:audit` + `service-reachability` + `pylint:duplicate-check` | analytics-specific gates; read the named failure. |
| `test:ci` | `… --cov-fail-under 95` + `test:strategy-snapshot:fast` | **95% coverage floor** (see [monorepo-coverage-gate](../monorepo-coverage-gate/SKILL.md)) and the strategy-snapshot gate. The snapshot/measurement gate needs `DATABASE_READ_ONLY_URL` (Supabase read-only replica) — it's **CI-validated only**; don't burn cycles reproducing it locally (see [apps/analytics-engine/CLAUDE.md](../../../apps/analytics-engine/CLAUDE.md)). |

## Reproduce locally

```bash
# first-time only — create the venv (wraps `uv sync --locked`)
pnpm --filter @zapengine/analytics-engine run build

# the fast, deterministic gates (no DB needed)
pnpm --filter @zapengine/analytics-engine run format:check lint type-check
pnpm --filter @zapengine/analytics-engine run dup:check
pnpm contracts check
```

New dependency? `uv add <pkg>` — **never `pip install`** (it won't touch
`uv.lock` and CI installs from the lock).

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "`ruff check` is clean, so formatting is fine." | `check` (linter) and `format` (formatter) are separate. CI's `format:check` runs the formatter. Run `ruff format`. |
| "The pre-commit hook passed, so format is fine." | lint-staged runs `ruff check --fix` only — not `ruff format`. Formatter drift escapes the hook. |
| "Add `# type: ignore` / `# noqa` to get past mypy/ruff." | That hides the defect the strict gate exists to catch. Add the annotation / fix the lint. |
| "Bump the jscpd threshold / re-quarantine the clones." | The quarantine is a deadline, not a permanent waiver. Eliminate the duplication or `jscpd:ignore` a genuinely-irreducible signature with a reason. |
| "I'll edit `uv.lock` by hand to fix a dep." | Use `uv add` / `uv lock`; hand-edits drift from CI's locked install. |

## Verification

```bash
pnpm --filter @zapengine/analytics-engine run format:check lint type-check
pnpm --filter @zapengine/analytics-engine run dup:check
pnpm contracts check
pnpm turbo run sql:audit service-reachability pylint:duplicate-check --filter=@zapengine/analytics-engine
```

All green, then push and read CI (Node 24 + the analytics snapshot gate, which
validates only on CI).
