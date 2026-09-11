/**
 * A provider that answered, but whose usage cannot be derived from what it
 * returned.
 *
 * This is not a transport or credential failure. Nothing is broken, retrying
 * will not help, and there is no remedy the operator can apply to the process:
 * the vendor simply stopped publishing the quantity the collector was reading.
 * Reporting that as an error keeps a scheduled sync permanently red, and a rail
 * that is red every day is a rail nobody reads — which is how a second,
 * genuinely broken provider would go unnoticed.
 *
 * Callers translate this into the ledger's "collected nothing" vocabulary
 * instead of its "this is broken" one. The message is authored here rather than
 * by the vendor, so it is safe to surface verbatim.
 */
export class UsageNotMeasurableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageNotMeasurableError';
  }
}
