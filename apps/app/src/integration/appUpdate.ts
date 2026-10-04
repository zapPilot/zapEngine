import type { DesktopUpdateState } from '@zapengine/types/shared';
import { z } from 'zod';
import { compareVersions } from '@/lib/version';
export type AppUpdateView = { currentVersion?: string } & (
  | {
      status:
        | 'hidden'
        | 'version-only'
        | 'checking'
        | 'up-to-date'
        | 'ready'
        | 'installing'
        | 'error'
        | 'move-to-applications';
    }
  | { status: 'available'; latestVersion?: string }
  | { status: 'downloading'; percent: number }
);
export function fromStoreVersions(
  currentVersion: string | null,
  latestVersion?: string,
): AppUpdateView {
  if (!currentVersion) return { status: 'hidden' };
  const comparison = latestVersion
    ? compareVersions(currentVersion, latestVersion)
    : undefined;
  if (comparison === undefined)
    return { status: 'version-only', currentVersion };
  return comparison < 0
    ? {
        status: 'available',
        currentVersion,
        latestVersion: latestVersion!,
      }
    : { status: 'up-to-date', currentVersion };
}
export function fromDesktopState(state: DesktopUpdateState): AppUpdateView {
  const { currentVersion } = state;
  switch (state.status) {
    case 'unsupported':
      return {
        currentVersion,
        status:
          state.reason === 'location' ? 'move-to-applications' : 'version-only',
      };
    case 'idle':
      return { currentVersion, status: 'version-only' };
    case 'available':
      return {
        currentVersion,
        status: 'available',
        latestVersion: state.version,
      };
    case 'downloaded':
      return { currentVersion, status: 'ready' };
    case 'downloading':
      return { currentVersion, status: 'downloading', percent: state.percent };
    default:
      return { currentVersion, status: state.status };
  }
}
const lookupSchema = z.object({
  resultCount: z.number().int().nonnegative(),
  results: z.array(z.object({ version: z.string().regex(/^\d+(\.\d+)*$/) })),
});
export function parseAppStoreLookup(value: unknown): string | undefined {
  const parsed = lookupSchema.safeParse(value);
  return parsed.success && parsed.data.resultCount > 0
    ? parsed.data.results[0]?.version
    : undefined;
}
export function appStoreIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'apps.apple.com'
      ? /\/id(\d+)(?:\/|$)/.exec(parsed.pathname)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
}
