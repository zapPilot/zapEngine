// Framework-free module errors (module CLAUDE.md: service errors carry no
// HTTP knowledge; route.ts owns the status mapping).

/** The simulated source-chain bundle reverted — the plan must not ship. */
export class PlanSimulationFailedError extends Error {
  constructor(reason: string) {
    super(`Plan simulation failed: ${reason}`);
    this.name = 'PlanSimulationFailedError';
  }
}

/**
 * Simulation could not run (outage, timeout, malformed response). Enforce
 * mode fails closed: no plan is returned without a passing simulation.
 */
export class PlanSimulationUnavailableError extends Error {
  constructor(reason: string) {
    super(`Plan simulation unavailable: ${reason}`);
    this.name = 'PlanSimulationUnavailableError';
  }
}
