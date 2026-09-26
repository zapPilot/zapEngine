import { setTimeout } from 'node:timers/promises';

import type { PlanOrchestrationDepositReviewResponse } from '@zapengine/types/api';
import { z } from 'zod';

import type { argumentsFor } from '../config/arguments.js';
import type { readEnv } from '../config/env.js';
import type { createChain } from '../lib/chain.js';
import { describeError } from '../lib/errors.js';
import type { createHttp } from '../lib/http.js';
import type { createMultibaas } from '../lib/multibaas.js';
import type { createRecognizer } from '../lib/openrouter.js';
import { createTelegram } from '../lib/telegram.js';
import { decide } from './decision.js';
import { RULE_ID } from './demoRule.js';
import { discover } from './discovery.js';
import { execute } from './execution.js';
import { notifiable, notify } from './notification.js';
import type { Store } from './types.js';

export async function daemon(input: {
  values: ReturnType<typeof argumentsFor>['values'];
  env: ReturnType<typeof readEnv>;
  http: ReturnType<typeof createHttp>;
  store: Store;
  chain: ReturnType<typeof createChain>;
  multibaas: ReturnType<typeof createMultibaas>;
  wallet: `0x${string}`;
  review: () => Promise<PlanOrchestrationDepositReviewResponse>;
  recognize: ReturnType<typeof createRecognizer>;
}): Promise<void> {
  const {
    values,
    env,
    http,
    store,
    chain,
    multibaas,
    wallet,
    review,
    recognize,
  } = input;
  const rule = `${RULE_ID}/${values.arm ?? 'dry-run'}`;
  const send = values.execute
    ? createTelegram(http, z.string().min(1).parse(env.telegramToken))
    : undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const iteration = async () => {
    await discover(
      store,
      rule,
      values.since ?? new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
      values.episode,
    );
    for (const action of await store.list(['pending'], rule))
      await decide(store, action, recognize, env.model, wallet);
    for (const action of await store.list(
      ['approved', 'submitting', 'submitted'],
      rule,
    )) {
      if (stopped) break;
      await execute(
        action,
        {
          store,
          signer: multibaas,
          chain,
          review,
          wallet,
          now: Date.now,
          sleep: async (ms) => {
            await setTimeout(ms);
          },
        },
        !values.execute,
      );
    }
    if (send)
      for (const action of await store.list(notifiable, rule, 100, true))
        await notify(store, action, env.podcastUrl, env.allowedUserIds, send);
  };
  try {
    do {
      try {
        await iteration();
      } catch (error) {
        // Every step is persisted and CAS-fenced, so the next pass is a restart.
        if (values.once) throw error;
        console.error(`News agent iteration failed: ${describeError(error)}`);
      }
      if (!values.once && !stopped) await setTimeout(30_000);
    } while (!values.once && !stopped);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
