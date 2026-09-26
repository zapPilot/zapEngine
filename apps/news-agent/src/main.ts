import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { PlanOrchestrationDepositReviewResponseSchema } from '@zapengine/types/api';
import { z } from 'zod';

import { argumentsFor } from './config/arguments.js';
import { readEnv } from './config/env.js';
import { createChain } from './lib/chain.js';
import { describeError } from './lib/errors.js';
import { createHttp } from './lib/http.js';
import { createMultibaas } from './lib/multibaas.js';
import { createRecognizer } from './lib/openrouter.js';
import { createStore } from './lib/supabase.js';
import { daemon } from './services/daemon.js';
import { hasKeyword, planRequest } from './services/demoRule.js';
import { guard } from './services/guard.js';
import { smoke } from './services/smoke.js';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { command, values, limit } = argumentsFor(argv);
  const env = readEnv();
  const http = createHttp();
  const store = createStore(env.supabaseUrl, env.supabaseKey);
  if (command === 'report') {
    console.log(
      JSON.stringify(
        await store.list(
          [
            'pending',
            'skipped',
            'approved',
            'blocked',
            'submitting',
            'submitted',
            'confirmed',
            'failed',
            'needs_attention',
          ],
          undefined,
          limit,
        ),
        null,
        2,
      ),
    );
    return;
  }
  const chain = createChain(env.rpcUrl);
  await chain.assertChain();
  const manualWallet = command === 'evaluate' ? values.wallet : undefined;
  const multibaas = manualWallet
    ? undefined
    : createMultibaas(
        http,
        z.url().parse(env.multibaasUrl),
        z.string().min(1).parse(env.multibaasKey),
      );
  if (multibaas) await multibaas.chainStatus();
  const wallet = manualWallet
    ? (manualWallet as `0x${string}`)
    : await multibaas!.listHsmWallets();
  const review = async () =>
    PlanOrchestrationDepositReviewResponseSchema.parse(
      await http.postJson(
        `${env.accountUrl.replace(/\/$/, '')}/plan-orchestration/deposit/review`,
        planRequest(wallet),
        {},
        90_000,
      ),
    );
  if (command === 'smoke') {
    await smoke(chain, multibaas!, wallet, async (ms) => {
      await setTimeout(ms);
    });
    return;
  }
  const recognize = createRecognizer(
    http,
    env.openrouterUrl,
    env.openrouterKey,
    env.model,
  );
  if (command === 'evaluate') {
    const episode = await store.episode(values.episode!);
    const decision = hasKeyword(episode.title, episode.raw_text)
      ? await recognize(episode.title, episode.raw_text)
      : { matches: false, evidence: 'No Bitget keyword' };
    const reviewed = await review();
    console.log(
      JSON.stringify(
        { decision, review: reviewed, guard: guard(reviewed, wallet) },
        null,
        2,
      ),
    );
    return;
  }
  await daemon({
    values,
    env,
    http,
    store,
    chain,
    multibaas: multibaas!,
    wallet,
    review,
    recognize,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(`News agent stopped: ${describeError(error)}`);
    process.exitCode = 1;
  }
}
