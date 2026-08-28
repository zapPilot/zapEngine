import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The one place this process shells out to `flyctl`.
 *
 * Both the cost collector and the infrastructure adapter read Machine state,
 * and both need the same two guards: a timeout, because an unauthenticated
 * flyctl waits on a login prompt that will never come and would otherwise hang
 * a dashboard request forever, and a raised buffer, because `machine list
 * --json` for an app with several Machines exceeds Node's 1 MB default and
 * fails with a truncation error that reads like a Fly outage.
 */
export async function runFlyctl(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('flyctl', args, {
    timeout: 20_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}
