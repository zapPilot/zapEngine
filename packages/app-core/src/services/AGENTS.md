See @../../AGENTS.md for app-core platform/runtime boundaries.

# App-core services

External API and chain access used by app-core lives here. Services are plain functions with no React/component dependencies; hooks consume services, never the reverse.

## Invariants

- Keep one upstream/domain responsibility per service module; private mapping helpers stay local unless they are genuinely shared.
- Validate external responses at the boundary with the existing Zod v4 schemas. Do not trust wire payloads.
- Throw typed app-core errors rather than returning ad-hoc `{ error }` objects.
- Use the shared HTTP client in `src/lib/http/` for auth, retry, timeout, and telemetry behavior.
- Use viem/service abstractions for chain RPC. Do not reach for `window.ethereum` from service code.
- `.mock.ts` services are development/test fixtures and must not enter production paths.
- `planOrchestrationService.ts` is the authoritative frontend client for backend deposit/rotate plans; app-core must not recompute those plans locally.
- Keep `@zapengine/intent-engine` access behind the existing intent client/builder boundary rather than scattering direct imports through unrelated services.
