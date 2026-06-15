# ci-autofix

A portable, autonomous CI auto-fixer for pnpm + turbo monorepos.

```
pnpm ci-autofix -- --model provider/model
```

It runs your CI jobs in parallel, picks the highest-priority failure, and hands
it to a fresh OpenCode session. The agent reruns the failing command itself to
see the precise error, fixes the root cause, and the supervisor reruns the job
until it passes, then re-scans — looping until everything is green and the
canonical gate passes.

## Layout

| File          | Role                                                                 | Per-repo? |
| ------------- | ------------------------------------------------------------------- | --------- |
| `ci-autofix.sh` | Main loop: detect → repair → rerun → re-detect → final gate.       | portable  |
| `detect.sh`     | Runs all jobs in parallel → `.ai-verify/result.json`. (`verify:full:parallel`) | portable  |
| `gate.sh`       | Sequential canonical gate; stops on first failure. (`verify:ci`)   | portable  |
| `registry.sh`   | **The only file you customize per repo** — declares the jobs.       | **yes**   |

The fixer agent itself lives at `.opencode/agents/ci-fixer.md` (OpenCode reads
agents from there). It runs with bash enabled so it can rerun commands and
self-verify, and is prompted never to fake a green (no deleting/skipping tests,
no editing CI/verify config). Its `edit` deny-list is best-effort prevention;
the authoritative rollback guard is `is_protected_path()` in `ci-autofix.sh` —
keep the two deny-lists in sync.

## Porting into another repo

1. **Copy** the whole `scripts/ci-autofix/` folder and `.opencode/agents/ci-fixer.md`.
2. **Edit `registry.sh`** — list your jobs explicitly (see template below) and set
   `CI_PROTECTED_PATHS` for any repo-specific files the agent must never touch.
3. **Wire `package.json`** scripts:
   ```jsonc
   "ci-autofix":          "bash scripts/ci-autofix/ci-autofix.sh",
   "verify:ci":           "bash scripts/ci-autofix/gate.sh",       // optional
   "verify:full:parallel":"bash scripts/ci-autofix/detect.sh"      // optional
   ```
4. **Gitignore** `.ai-verify/` (job logs + result.json) and `.agent-loop/` (per-run state).
5. **Prerequisites**: `opencode` CLI on `PATH`. `timeout`/`gtimeout` is optional — with
   the default `--timeout 900` it enforces a per-job timeout when present, otherwise it
   warns and runs without one (macOS: `brew install coreutils` to enable it).
   The scripts assume they live at `<repo>/scripts/ci-autofix/` (repo root is two levels up).

## `registry.sh` template (standard pnpm + turbo repo)

```bash
#!/usr/bin/env bash
# Per-repo ci-autofix config.

# Job IDs in priority order (first = fixed first).
CORE_CI_JOB_IDS="format turbo"

core_ci_job_name() {
  case "$1" in
    format) echo "Format check" ;;
    turbo)  echo "Turbo workspace checks" ;;
    *)      echo "unknown ($1)" ;;
  esac
}

core_ci_job_command() {
  case "$1" in
    format) echo "pnpm format:check" ;;
    turbo)  echo "pnpm turbo run lint type-check test:ci" ;;
    *)      return 1 ;;
  esac
}

core_ci_job_log() {
  case "$1" in
    format) echo "format.log" ;;
    turbo)  echo "turbo.log" ;;
    *)      return 1 ;;
  esac
}

# Repo-specific protected globs (whitespace-separated), on top of the portable
# base baked into ci-autofix.sh (lockfiles, .github/workflows/*,
# scripts/ci-autofix/*, .opencode/agents/*, coverage, CLAUDE.md, …).
# package.json + snapshots are intentionally editable.
CI_PROTECTED_PATHS=""
```

## Options

| Flag           | Default    | Meaning                                            |
| -------------- | ---------- | -------------------------------------------------- |
| `--model ID`   | (required) | OpenCode model ID for every fresh repair session.  |
| `--max-iters N`| `0`        | Stop after N repair attempts; `0` = unlimited.     |
| `--timeout S`  | `900`      | Per-job timeout in seconds; `0` disables.          |
| `--agent NAME` | `ci-fixer` | OpenCode agent name.                               |

## Stop conditions

The loop stops when: all jobs pass and the canonical gate is green; the
iteration cap is reached; OpenCode fails 3 times in a row without edits; the
same failure gets no edits 3 times; or the agent touches a protected path
(edits are rolled back). Blockers are written to `.agent-loop/blocker-report.txt`.
