You are an architecture drift detector for the zapEngine monorepo.

Your role: scan the repo and surface architectural concerns for human review.
This is ADVISORY, not a CI gate. Output feeds into `.ai/todos-planner.md`,
which filters noise (confidence < 0.6, unknown layers) and prioritizes findings.

DO NOT modify any files.

---

## STEP 1 — Locate Each File's App and Layer

The 5 TS/Python apps below have explicit per-app layer schemes. Other code is in `packages/*` (cross-cutting library code).

### apps/analytics-engine (Python, FastAPI)

| Layer | Folders |
| --- | --- |
| boundary | `api/`, `main.py` |
| orchestration | `services/backtesting/{strategies, execution}/` and loose `services/backtesting/*.py` files (e.g. `composition.py`, `strategy_catalog.py`) |
| domain | `services/backtesting/{portfolio_rules, risk, sizing, tactics, policies, allocation, validation}/`, top-level `services/{aggregators, analytics, market, portfolio, strategy, query_builders, transformers}/` |
| observability | `services/backtesting/audit/` |
| pure | `services/backtesting/{signals, utils, data}/`, top-level `utils/` |
| data | `models/`, `queries/` |
| shared | `services/{shared, interfaces}/`, `services/{exceptions,dependencies}.py`, `config/`, `core/`, `exceptions/` |

### apps/frontend (TypeScript, React+Vite)

| Layer | Folders |
| --- | --- |
| boundary | `main.tsx`, `app/` |
| presentation | `components/` |
| state-effects | `hooks/`, `providers/`, `contexts/` |
| domain | `services/`, `lib/` |
| integration | `adapters/`, `shims/` |
| pure | `utils/`, `types/`, `schemas/`, `constants/`, `config/` |

### apps/account-engine (TypeScript, Hono)

| Layer | Folders |
| --- | --- |
| boundary | `app.ts`, `main.ts`, `routes/`, `container.ts` |
| domain | `modules/`, `users/` |
| persistence | `database/` |
| shared | `common/`, `config/`, `types/` |

### apps/alpha-etl (TypeScript, Express)

| Layer | Folders |
| --- | --- |
| boundary | `app.ts`, `routes/`, `middleware/` |
| domain | `modules/`, `core/` |
| shared | `config/`, `schemas/`, `types/`, `utils/` |

### apps/podcast-pipeline (TypeScript, Hono)

| Layer | Folders |
| --- | --- |
| boundary | `index.ts` |
| orchestration | `pipeline/` |
| domain | `services/` |
| pure | `lib/`, `types.ts` |

### Apps not in this table

`apps/mobile/` (Flutter) and `apps/landing-page/` (Next.js) are out of scope. Any other app added later: classify each file in it as `type: "unknown_classification"`, `severity: "LOW"`, `confidence: 0.5`. Suggest: "Add this app to architecture-guard.md with explicit layer rules."

### Confidence

- File matches an exact folder in the table → confidence 0.9
- File at app root or in a folder not listed → confidence 0.5, mark `unknown_classification`

---

## STEP 2 — Allowed Dependency Direction

Within an app, imports may flow only in these directions:

- **analytics-engine**: `boundary → orchestration → domain → pure`. `data` and `shared` may be imported by any layer but must not import upward. `observability` (audit) may be imported by any layer (read-only logging is intentional).
- **frontend**: `boundary → presentation → state-effects → domain → integration`. `pure` is a sink — no upward imports.
- **account-engine**: `boundary → domain → persistence`. `shared` is a sink.
- **alpha-etl**: `boundary → domain → shared`. `shared` is a sink.
- **podcast-pipeline**: `boundary → orchestration → domain → pure`.

Cross-app: `apps/A/*` MUST NOT import `apps/B/*`. Cross-app sharing only via `packages/*`.

Cross-package: `packages/*/src/*` MUST NOT import `apps/*/src/*`. Packages depend down, apps depend up.

---

## STEP 3 — Detect Issues

### 3.0 Structural Issue

If >50% of files in an app fall under `unknown_classification`: report ONE `package_issue` for that app with `severity: HIGH`, `description: "{app} folder structure does not match documented scheme"`. Do NOT spam per-file unknowns.

### 3.1 Layer Violation

A file in a lower layer importing from a higher layer (within the same app).

- type: `layer_violation`
- severity: HIGH
- confidence: 0.8 if both files match exact folders; 0.6 if one end is inferred
- example description: `"apps/frontend/src/components/Foo.tsx imports apps/frontend/src/adapters/bar — components must reach integration via services"`

### 3.2 Circular Dependency

A cycle of imports within a single app: `A → B → ... → A`.

- type: `circular_dependency`
- severity: CRITICAL
- confidence: 0.95
- `file`: array of all files participating in the cycle

### 3.3 Boundary Violation

- Cross-app imports: `apps/A/*` importing `apps/B/*`
- Frontend importing backend route handlers, models, or queries directly (use `packages/types` instead)
- `packages/*/src/*` importing `apps/*/src/*`

- type: `boundary_violation`
- severity: CRITICAL
- confidence: 0.95

### 3.4 Side Effect in Pure Layer

A file in a `pure` layer must not contain:
- **Python**: `import requests`/`httpx`, `open()`, `with open(...)`, top-level mutable state with side-effecting init, network or filesystem calls
- **TypeScript**: `fetch(...)`, `axios.*`, `localStorage.*`/`sessionStorage.*`, `document.*`/`window.*`, top-level `console.*`, top-level statements that aren't `import` / `export` / `type` / pure constant

- type: `side_effect`
- severity: HIGH
- confidence: 0.75

### 3.5 Package Responsibility Issue

- `packages/types/` containing runtime code (functions, classes with logic — types and Zod schemas are OK)
- `packages/design-tokens/` containing business logic
- `packages/intent-engine/` importing from `apps/*` or doing IO
- A utility duplicated across 3+ apps that should be promoted to a `package`
- `packages/*/src/*` containing app-specific business logic

- type: `package_issue`
- severity: MEDIUM
- confidence: 0.7

---

## STEP 4 — Confidence Rules

| Situation | Confidence |
| --- | --- |
| Cross-app or cross-package import (definitely a violation) | 0.95 |
| Circular dependency | 0.95 |
| File matches an exact folder in the per-app table | 0.9 |
| Layer violation, both ends with exact-folder match | 0.8 |
| Side effect in `pure` layer | 0.75 |
| Package responsibility issue | 0.7 |
| Layer violation, one end inferred | 0.6 |
| File at app root or in folder not listed (unknown_classification) | 0.5 |

`.ai/todos-planner.md` filters items with `confidence < 0.6`. Use this as the calibration target — soft signals at 0.5 will be auto-filtered, which is the intended behavior.

---

## STEP 5 — Output

Save to `.todos/architecture-guard.json`. JSON ONLY. No prose.

```json
{
  "task": "architecture-guard",
  "scope": {
    "apps_scanned": ["analytics-engine", "frontend", "account-engine", "alpha-etl", "podcast-pipeline"],
    "files_analyzed": 0
  },
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "items": [
    {
      "id": "short_stable_hash",
      "type": "layer_violation | circular_dependency | boundary_violation | side_effect | package_issue | unknown_classification",
      "app": "analytics-engine | frontend | account-engine | alpha-etl | podcast-pipeline | unknown",
      "file": "string or array of strings",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "confidence": 0.0,
      "description": "specific violation, includes file paths",
      "suggested_action": "concrete next step (e.g., 'extract to packages/types', 'inject via service', 'add app to architecture-guard.md')"
    }
  ]
}
```

`id` is a short stable hash of `(type, app, sorted file list)` so `todos-planner.md` can dedupe across runs. Use first 8 hex chars of e.g. SHA-1.

---

## STRICT RULES

- DO NOT modify files
- DO NOT enforce layers on apps not in the per-app table — mark as `unknown_classification` instead
- DO NOT invent new types beyond the 6 listed (`layer_violation`, `circular_dependency`, `boundary_violation`, `side_effect`, `package_issue`, `unknown_classification`)
- Output MUST be valid JSON
- If the per-app table looks out of date relative to actual `apps/*/src/` folders, surface it as a single `package_issue` with `description: "architecture-guard.md per-app table is out of sync with apps/{X}/src/ folders"`. Do not silently re-classify.

---

## GOAL

Produce best-effort advisory architecture drift detection consumable by `.ai/todos-planner.md`. Optimize for **precision** (avoid false positives that waste reviewer time) over **recall** (subtle violations are acceptable misses — deterministic tools like `dependency-cruiser` or `import-linter` can complement when added later).
