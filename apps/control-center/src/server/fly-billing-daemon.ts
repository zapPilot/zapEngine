import { readControlCenterConfig } from './config/env.js';
import { createCostRepository } from './services/cost-repository.js';
import { postgrestErrorMessage } from './services/supabase.js';
import {
  FLY_BILLING_MAX_AGE_MS,
  syncFlyBilling,
} from './services/fly-billing/index.js';

/**
 * Keeps the Fly month-to-date figure current for as long as `pnpm ops` runs.
 *
 * Fly publishes no billing API and its dashboard takes a cookie, not a token,
 * so the real number can only be read by a browser somebody has signed in. That
 * makes this the one collector that cannot live in the nightly GitHub job: it
 * belongs beside the social daemon on the operator's own machine, and the
 * scheduled sync keeps carrying whatever this last wrote.
 *
 * Two rules keep it well-behaved as a background child:
 *
 * - It never exits non-zero. `scripts/ops.mjs` reports a failed child and ends
 *   the whole stack non-zero, so exiting on "not signed in" would make every
 *   un-signed-in `pnpm ops` session end red. A missing figure is already
 *   visible where it matters — the ledger row says "run-rate only" and the KPI
 *   band names Fly as excluded.
 * - It opens a window only when one is actually needed, and at most once. Fly
 *   usually re-establishes its own session from the identity provider's cookie
 *   already in the profile, so every read starts headless; a window appears
 *   only after that has genuinely come back signed out. After the first one,
 *   later attempts stay headless and say so in the log rather than interrupting
 *   an operator who has decided not to sign in right now.
 */
const log = (message: string) => process.stdout.write(`${message}\n`);

const config = readControlCenterConfig();
const repository = createCostRepository(config);
if (!repository) {
  log('fly-billing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(0);
}

let promptedForSignIn = false;
let stopping = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
    process.exit(0);
  });
}

log(
  `fly-billing: reading the Fly dashboard every ${Math.round(FLY_BILLING_MAX_AGE_MS / 60000)} min`,
);

while (!stopping) {
  await runOnce();
  await sleep(FLY_BILLING_MAX_AGE_MS);
}

async function runOnce(): Promise<void> {
  const onLog = (message: string) => log(`fly-billing: ${message}`);
  try {
    let result = await syncFlyBilling({
      repository: repository!,
      interactive: false,
      onLog,
    });

    if (result.status === 'auth_required' && !promptedForSignIn) {
      promptedForSignIn = true;
      result = await syncFlyBilling({
        repository: repository!,
        interactive: true,
        onLog,
      });
    }

    if (result.status === 'auth_required') {
      log(
        'fly-billing: still signed out — restart `pnpm ops` when you are ready to sign in',
      );
    }
    log(`fly-billing: ${result.message}`);
  } catch (error) {
    // A crash here must not take the loop down: the next hour is a free retry,
    // and the alternative is a silent gap in the only source of Fly's real cost.
    //
    // The message goes through `postgrestErrorMessage` because the likeliest
    // failure is the write, and PostgREST rejects with a plain object rather
    // than an `Error` -- `String(error)` turns a named constraint violation
    // into `[object Object]`, which is the one detail worth having here.
    log(
      `fly-billing: read failed, retrying next cycle — ${postgrestErrorMessage(error, 'unknown failure')}`,
    );
  }
}

// A plain timer, deliberately not unref'd: it is the only thing holding this
// process open between reads, and the signal handlers above are what end it.
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
