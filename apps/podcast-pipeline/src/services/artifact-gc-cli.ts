import { errorMessage } from '../lib/errorMessage.js';
import { createArtifactGcDependencies, runArtifactGc } from './artifact-gc.js';

const args = process.argv.slice(2);
if (
  args.some((arg) => arg !== '--apply' && arg !== '--dry-run') ||
  args.length > 1
) {
  console.error('Usage: artifacts:gc [--dry-run | --apply] (default: dry-run)');
  process.exitCode = 2;
} else {
  try {
    const result = await runArtifactGc(createArtifactGcDependencies(), {
      apply: args.includes('--apply'),
    });
    if (result.failures) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'gc:fatal', error: errorMessage(error) }),
    );
    process.exitCode = 1;
  }
}
