/** The one `[video-worker] event k=v k=v ...` line formatter, shared by the
 * render processor, the visual processor, and the worker's own lifecycle
 * lines. `undefined` fields are dropped rather than printed as `key=undefined`. */
export function logVideoWorkerEvent(
  logger: Pick<Console, 'info'>,
  event: string,
  fields: Record<string, string | number | undefined>,
): void {
  const details = Object.entries(fields)
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${value}`]))
    .join(' ');
  logger.info(`[video-worker] ${event} ${details}`);
}
