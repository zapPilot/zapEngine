See @../../CLAUDE.md for monorepo development guidelines.

# Package-Specific Constraints

This is the **intent / routing** core: `intent → PreparedTransaction[]`, pure. It MUST
have zero analytics/strategy and zero identity/persistence knowledge; internal deps
limited to `@zapengine/types`. Dual-host — bundled client-side by frontend and (target)
called by `plan-orchestration`. Composition happens in plan-orchestration, downward;
this core never depends upward. See root `# Architecture planes`.
