import { readFile } from 'node:fs/promises';

/**
 * The most jobs any render Machine may run at once — a ceiling, not the live
 * capacity, which {@link renderJobCapacity} derives from the vCPU count.
 *
 * Two, because everything below it is built for exactly one extra job:
 * {@link RENDER_ADMISSION_MIN_FREE_BYTES} budgets one render's worth of
 * anonymous memory, the visual cap is one, and `render-capacity.ts` wakes a
 * single Machine on the assumption that it fills its own second slot.
 *
 * What that second slot buys is not a faster encode — one 720p encode already
 * saturates a core. It is the ~90 s per render (narration download, alignment,
 * upload) plus the poll gap between jobs, when the dedicated CPU would
 * otherwise do no encoding at all.
 */
export const RENDER_MAX_CONCURRENT_JOBS = 2;

/**
 * How many jobs this machine may actually run, given its vCPU count.
 *
 * A job past the core count does not render in parallel: it queues for CPU it
 * cannot get while still holding ~0.75 GiB of its own anonymous memory. On the
 * current `performance-1x` render shape that is the difference between fitting
 * in 2 GB and being OOM-killed — production sampling put two concurrent renders
 * at 2608 MB against a solo peak of 1908 MB. So the cap tracks the hardware
 * rather than the fly.toml shape, and a resize needs no change here.
 */
export function renderJobCapacity(cpuCount: number): number {
  return Math.min(RENDER_MAX_CONCURRENT_JOBS, cpuCount);
}

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
  /** This machine's slot count; see {@link renderJobCapacity}. */
  capacity: number;
  /** `null` when the host exposes no `MemFree`; see {@link readProcMemFreeBytes}. */
  freeBytes: number | null;
}

export function evaluateRenderAdmission(
  input: RenderAdmissionInput,
): RenderAdmission {
  if (input.inFlight >= input.capacity) {
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
