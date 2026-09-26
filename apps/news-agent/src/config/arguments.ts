import { parseArgs } from 'node:util';

import { z } from 'zod';

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export function argumentsFor(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv.filter((value) => value !== '--'),
    allowPositionals: true,
    options: {
      'multibaas-url': { type: 'string' },
      'multibaas-key-file': { type: 'string' },
      episode: { type: 'string' },
      execute: { type: 'boolean' },
      replay: { type: 'string' },
      chat: { type: 'string' },
      'laya-url': { type: 'string' },
      port: { type: 'string' },
    },
  });
  const command = z
    .enum(['init', 'multibaas-setup', 'demo', 'serve'])
    .parse(positionals[0]);
  if (positionals.length !== 1)
    throw new Error('Unexpected positional arguments');
  if (
    Boolean(values['multibaas-url']) !== Boolean(values['multibaas-key-file'])
  )
    throw new Error('--multibaas-url and --multibaas-key-file go together');
  if (values['multibaas-url']) z.url().parse(values['multibaas-url']);
  if (values.episode) z.uuid().parse(values.episode);
  if (values.replay) hash.parse(values.replay);
  if (values.chat)
    z.string()
      .regex(/^-?\d{1,20}$/)
      .parse(values.chat);
  if (values.execute && values.replay)
    throw new Error('--execute and --replay are exclusive');
  if (command === 'demo' && !values.episode)
    throw new Error('demo requires --episode <episodes.id>');
  return {
    command,
    multibaasUrl: values['multibaas-url'],
    multibaasKeyFile: values['multibaas-key-file'],
    episode: values.episode,
    execute: values.execute ?? false,
    replay: values.replay as `0x${string}` | undefined,
    chat: values.chat,
    layaUrl: z.url().parse(values['laya-url'] ?? 'http://127.0.0.1:8000'),
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .parse(values.port ?? '8787'),
  };
}
