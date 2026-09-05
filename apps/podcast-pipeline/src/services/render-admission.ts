import { readFile } from 'node:fs/promises';

/**
 * How many jobs one render Machine runs at once.
 *
 * Two, because `performance-2x` has two vCPUs and a 720p encode saturates
 * roughly one of them — production sampling put both cores at 75-90% for the
 * whole encode of a single render. A third job would queue for CPU it cannot
 * get while still holding its own memory, so this constant must never exceed
 * the machine's vCPU count.
 *
 * What the second slot buys is not a faster encode. It is the ~90 s per render
 * (narration download, alignment, upload) plus the poll gap between jobs, when
 * the dedicated CPU previously did no encoding at all. Setting this back to 1
 * restores the strictly serial behaviour.
 */
export const RENDER_MAX_CONCURRENT_JOBS = 2;

/**
 * Visual planning stays serial even when a render runs beside it.
 * `video/brave-image-search.ts` turns a 429 into a terminal provider error —
 * no retry, no Retry-After — which the resilient path degrades into worse
 * imagery rather than a failure anyone sees. Two visual jobs would double the
 * instantaneous rate against that quota and buy no encode throughput at all.
 */
export const RENDER_MAX_CONCURRENT_VISUAL_JOBS = 1;

/**
 * Free memory the machine must still have before a second job is admitted.
 *
 * Deliberately `MemFree` and not `MemAvailable`: on these Fly VMs the kernel's
 * availability estimate sits at 50-78 MiB while several GiB are genuinely
 * free, so a guard built on it would never admit anything.
 *
 * 1.25 GiB is the budget. The worst render in the ops ledger peaked near
 * 1.9 GB of cgroup memory, but only ~1.0 GiB of that was anonymous — the rest
 * was page cache the kernel reclaims on demand, which is why `MemFree` still
 * read ~1.9 GiB at that peak. A second render adds at most ~0.75 GiB of anon
 * on top of the shared Node heap, so this threshold leaves ~0.5 GiB of slack
 * and lets the cache shrink into it rather than counting it as headroom.
 */
export const RENDER_ADMISSION_MIN_FREE_BYTES = 1_342_177_280;

export type RenderAdmission =
  | { admit: true; claimVisual: boolean }
  | { admit: false; reason: 'at-capacity' | 'low-memory' };

export interface RenderAdmissionInput {
  inFlight: number;
  inFlightVisuals: number;
  /** `null` when the host exposes no `MemFree`; see {@link readProcMemFreeBytes}. */
  freeBytes: number | null;
}

export function evaluateRenderAdmission(
  input: RenderAdmissionInput,
): RenderAdmission {
  if (input.inFlight >= RENDER_MAX_CONCURRENT_JOBS) {
    return { admit: false, reason: 'at-capacity' };
  }
  // An unreadable MemFree fails closed to the behaviour that predates slots:
  // one job at a time. macOS development and the test suite take this path, so
  // concurrency is something only a Linux render Machine ever gets.
  if (
    input.inFlight > 0 &&
    (input.freeBytes === null ||
      input.freeBytes < RENDER_ADMISSION_MIN_FREE_BYTES)
  ) {
    return { admit: false, reason: 'low-memory' };
  }
  return {
    admit: true,
    claimVisual: input.inFlightVisuals < RENDER_MAX_CONCURRENT_VISUAL_JOBS,
  };
}

/**
 * Reads `MemFree` straight out of `/proc/meminfo`. Node has no API for it:
 * `os.freemem()` reports the same figure on Linux but the sampler has to parse
 * the file anyway to stay honest about which field it is reading, and a
 * missing or malformed line must degrade to `null` rather than to zero — zero
 * would read as "no memory left" and permanently hold the second slot shut.
 */
export async function readProcMemFreeBytes(): Promise<number | null> {
  try {
    const meminfo = await readFile('/proc/meminfo', 'utf8');
    const kilobytes = /^MemFree:\s+(\d+)\s+kB$/m.exec(meminfo)?.[1];
    if (kilobytes === undefined) return null;
    const bytes = Number(kilobytes) * 1024;
    return Number.isFinite(bytes) ? bytes : null;
  } catch {
    // Local development and non-Linux hosts do not expose /proc.
    return null;
  }
}
