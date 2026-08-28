import { logger } from '../../utils/logger.js';

/**
 * Run one bookkeeping write, swallowing every failure.
 *
 * The usage ledger and the per-source refresh state are both records *about* a
 * pipeline rather than part of it: a rejected insert must never turn a day of
 * successfully written portfolio data into a failed source. They also fail open
 * in the same direction, which is what makes one contract serve both — an
 * unwritten row leaves the wallet due, so the next run over-refreshes rather
 * than skipping a provider that never landed.
 */
export async function writeBookkeepingNonFatal(input: {
  rows: readonly unknown[];
  write: () => Promise<void>;
  failureMessage: string;
  jobId: string;
}): Promise<void> {
  if (input.rows.length === 0) {
    return;
  }

  try {
    await input.write();
  } catch (error) {
    logger.warn(input.failureMessage, {
      jobId: input.jobId,
      rowCount: input.rows.length,
      error,
    });
  }
}
