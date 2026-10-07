/** Create an isolated simulator so concurrent smoke runs cannot shut each other down. */
export function createSmokeSimulator(template, capture) {
  const name = `Zap Pilot smoke ${process.pid}`;
  const result = capture('xcrun', [
    'simctl',
    'create',
    name,
    template.deviceTypeIdentifier,
    template.runtime,
  ]);
  const udid = result.stdout.trim();
  if (result.status !== 0 || !udid) {
    throw new Error(
      `Unable to create an isolated iOS simulator: ${result.stderr}`,
    );
  }
  return { name, udid, runtime: template.runtime, state: 'Shutdown' };
}
