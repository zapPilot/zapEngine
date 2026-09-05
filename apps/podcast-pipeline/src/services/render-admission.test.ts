import { describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock('node:fs/promises', () => ({ readFile: fs.readFile }));

import {
  evaluateRenderAdmission,
  readProcMemFreeBytes,
  RENDER_ADMISSION_MIN_FREE_BYTES,
  RENDER_MAX_CONCURRENT_JOBS,
  RENDER_MAX_CONCURRENT_VISUAL_JOBS,
} from './render-admission.js';

// Trimmed to the fields the parser has to distinguish. MemAvailable is here on
// purpose: it is the field this guard must *not* read, and on a Fly render VM
// it really does sit two orders of magnitude below MemFree.
const MEMINFO = [
  'MemTotal:        4019132 kB',
  'MemFree:         1998876 kB',
  'MemAvailable:      63104 kB',
  'Buffers:            2048 kB',
  '',
].join('\n');

describe('evaluateRenderAdmission', () => {
  it('admits the first job whatever memory reports', () => {
    expect(
      evaluateRenderAdmission({
        inFlight: 0,
        inFlightVisuals: 0,
        freeBytes: null,
      }),
    ).toEqual({ admit: true, claimVisual: true });
  });

  it('admits a second job once free memory clears the floor', () => {
    expect(
      evaluateRenderAdmission({
        inFlight: 1,
        inFlightVisuals: 0,
        freeBytes: RENDER_ADMISSION_MIN_FREE_BYTES,
      }),
    ).toEqual({ admit: true, claimVisual: true });
  });

  it.each<[string, number | null]>([
    ['free memory is short', RENDER_ADMISSION_MIN_FREE_BYTES - 1],
    ['MemFree cannot be read at all', null],
  ])('holds the second job when %s', (_reason, freeBytes) => {
    expect(
      evaluateRenderAdmission({ inFlight: 1, inFlightVisuals: 0, freeBytes }),
    ).toEqual({ admit: false, reason: 'low-memory' });
  });

  it('refuses a job past the slot cap however much memory is free', () => {
    expect(
      evaluateRenderAdmission({
        inFlight: RENDER_MAX_CONCURRENT_JOBS,
        inFlightVisuals: 0,
        freeBytes: RENDER_ADMISSION_MIN_FREE_BYTES * 4,
      }),
    ).toEqual({ admit: false, reason: 'at-capacity' });
  });

  it('admits the job but not as visual work once the visual cap is reached', () => {
    expect(
      evaluateRenderAdmission({
        inFlight: 1,
        inFlightVisuals: RENDER_MAX_CONCURRENT_VISUAL_JOBS,
        freeBytes: RENDER_ADMISSION_MIN_FREE_BYTES,
      }),
    ).toEqual({ admit: true, claimVisual: false });
  });
});

describe('readProcMemFreeBytes', () => {
  it('reads MemFree and not MemAvailable', async () => {
    fs.readFile.mockResolvedValue(MEMINFO);

    await expect(readProcMemFreeBytes()).resolves.toBe(1_998_876 * 1024);
    expect(fs.readFile).toHaveBeenCalledWith('/proc/meminfo', 'utf8');
  });

  it('returns null rather than zero when the file carries no MemFree line', async () => {
    fs.readFile.mockResolvedValue('MemTotal:        4019132 kB\n');

    // Zero would read as "no memory left" and hold the second slot shut for the
    // life of the machine.
    await expect(readProcMemFreeBytes()).resolves.toBeNull();
  });

  it('returns null on a host without /proc', async () => {
    fs.readFile.mockRejectedValue(new Error('ENOENT'));

    await expect(readProcMemFreeBytes()).resolves.toBeNull();
  });
});
