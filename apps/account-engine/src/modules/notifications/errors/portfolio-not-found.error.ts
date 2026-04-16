/**
 * Thrown when analytics-engine returns 404 for portfolio data.
 * This is an expected state for newly onboarded users or users
 * whose portfolio hasn't been indexed yet.
 */
export class PortfolioNotFoundError extends Error {
  constructor(
    public readonly userId: string,
    message?: string,
  ) {
    super(
      message ??
        `Portfolio data not found for user: ${userId}. User may be newly onboarded or portfolio not yet indexed.`,
    );
    this.name = 'PortfolioNotFoundError';

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PortfolioNotFoundError.prototype);
  }
}
