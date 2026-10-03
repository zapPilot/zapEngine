import './sentry-init.js';

import {
  collectDbEvidence,
  readDbEvidenceConfig,
  runDbEvidenceLoop,
} from './db-evidence.js';
import { flushSentry } from './sentry.js';

let exitCode = 0;
try {
  const config = readDbEvidenceConfig();
  const args = process.argv.slice(2);
  const directoryIndex = args.indexOf('--directory');
  if (directoryIndex >= 0) {
    const directory = args[directoryIndex + 1];
    if (!directory) throw new Error('--directory requires a path');
    config.directory = directory;
    args.splice(directoryIndex, 2);
  }
  if (args.some((arg) => arg !== '--once'))
    throw new Error('Usage: db:evidence [--once] [--directory path]');
  if (args.includes('--once')) {
    const result = await collectDbEvidence(config);
    if (!result.metrics.ok || !result.database.ok) exitCode = 1;
  } else {
    const controller = new AbortController();
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => controller.abort());
    await runDbEvidenceLoop(config, { signal: controller.signal });
  }
} catch (error) {
  exitCode = 1;
  console.error('db-evidence: CLI failed', error);
} finally {
  await flushSentry();
  // SDK HTTP transports can retain handles even after flush. This CLI owns its
  // process; terminate only after the bounded evidence flush has completed.
  process.exit(exitCode);
}
