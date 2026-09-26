import { parseArgs } from 'node:util';

import { z } from 'zod';

export function argumentsFor(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv.filter((value) => value !== '--'),
    allowPositionals: true,
    options: {
      execute: { type: 'boolean' },
      arm: { type: 'string' },
      once: { type: 'boolean' },
      since: { type: 'string' },
      episode: { type: 'string' },
      wallet: { type: 'string' },
      limit: { type: 'string' },
    },
  });
  const command = z
    .enum(['run', 'evaluate', 'smoke', 'report'])
    .parse(positionals[0]);
  if (positionals.length !== 1)
    throw new Error('Unexpected positional arguments');
  if (values.execute && (!values.arm || command !== 'run'))
    throw new Error('--execute requires run --arm <label>');
  if (values.arm)
    z.string()
      .regex(/^[a-zA-Z0-9_-]{1,64}$/)
      .parse(values.arm);
  if (values.episode) z.uuid().parse(values.episode);
  if (command === 'evaluate' && !values.episode)
    throw new Error('evaluate requires --episode');
  if (values.wallet)
    z.string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .parse(values.wallet);
  if (values.since && !Number.isFinite(Date.parse(values.since)))
    throw new Error('Invalid --since');
  return {
    command,
    values,
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(values.limit ?? 20),
  };
}
