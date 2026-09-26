import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { PlanOrchestrationDepositReviewResponseSchema } from '@zapengine/types/api';
import { privateKeyToAccount } from 'viem/accounts';

import { argumentsFor } from './config/arguments.js';
import { type Env, readEnv } from './config/env.js';
import {
  initLocal,
  type LocalPaths,
  localPaths,
  readAgentKey,
  readMultibaasConfig,
} from './config/local.js';
import { describeError } from './lib/errors.js';
import { createHttp } from './lib/http.js';
import { createLaya } from './lib/laya.js';
import { createMultibaas } from './lib/multibaas.js';
import { createPodcast } from './lib/podcast.js';
import { createTelegram } from './lib/telegram.js';
import { runDemo } from './services/demo.js';
import { planRequest } from './services/demoRule.js';
import { multibaasSetup } from './services/multibaasSetup.js';

export interface MainDeps {
  paths?: LocalPaths;
  fetcher?: typeof fetch;
  log?: (line: string) => void;
  env?: () => Env;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function main(
  argv = process.argv.slice(2),
  deps: MainDeps = {},
): Promise<void> {
  const args = argumentsFor(argv);
  const paths = deps.paths ?? localPaths();
  const log = deps.log ?? console.log;
  const http = createHttp(deps.fetcher);
  if (args.command === 'init') {
    const multibaas = args.multibaasKeyFile
      ? {
          url: args.multibaasUrl!,
          apiKey: (await readFile(args.multibaasKeyFile, 'utf8')).trim(),
        }
      : undefined;
    const { address, created } = await initLocal(paths, multibaas);
    log(
      `${created ? 'Created' : 'Reusing'} agent wallet ${address} (private key stays in ${paths.key})`,
    );
    if (multibaas) log(`Saved MultiBaas config to ${paths.multibaas}`);
    log('Fund it on Base with ~3 USDC + 0.0005 ETH; keep the total below $5.');
    return;
  }
  const config = await readMultibaasConfig(paths);
  const multibaas = createMultibaas(http, config.url, config.apiKey);
  if (args.command === 'multibaas-setup') {
    await multibaasSetup(multibaas, log);
    return;
  }

  const env = (deps.env ?? readEnv)();
  const account = privateKeyToAccount(await readAgentKey(paths));
  const chat =
    args.chat ??
    env.allowedUserIds
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
  const token = env.telegramToken;
  // Fail before any signing if the story cannot be delivered afterwards.
  if ((args.execute || args.replay) && (!token || !chat))
    throw new Error(
      'Telegram needs PIPELINE_TELEGRAM_BOT_TOKEN and --chat or PIPELINE_TELEGRAM_ALLOWED_USER_IDS',
    );
  const { blockNumber } = await multibaas.status();
  log(
    `🤖 Agent    ${account.address} · MultiBaas on Base (block ${blockNumber})`,
  );
  const podcast = createPodcast(http, env.podcastUrl);
  const outcome = await runDemo(
    { episode: args.episode, execute: args.execute, replay: args.replay },
    {
      wallet: account.address,
      log,
      now: deps.now ?? Date.now,
      sleep:
        deps.sleep ??
        (async (ms) => {
          await setTimeout(ms);
        }),
      episode: podcast.episode,
      laya: createLaya(http, args.layaUrl),
      review: async () =>
        PlanOrchestrationDepositReviewResponseSchema.parse(
          await http.postJson(
            `${env.accountUrl.replace(/\/$/, '')}/plan-orchestration/deposit/review`,
            planRequest(account.address),
            {},
            90_000,
          ),
        ),
      multibaas,
      sign: (tx) => account.signTransaction(tx),
      notify: (text, previewUrl) =>
        createTelegram(http, token!)(chat!, text, previewUrl),
      smartLink: podcast.smartLink,
    },
  );
  log(`Outcome: ${outcome}`);
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
