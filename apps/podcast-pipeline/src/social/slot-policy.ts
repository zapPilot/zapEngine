import {
  SOCIAL_RELEASE_DAILY_CAP,
  SOCIAL_RELEASE_SLOTS,
  type SocialReleaseSlot,
} from './policy.js';

const JST_OFFSET_HOURS = 9;
const DAY_MS = 24 * 60 * 60_000;

/**
 * How far ahead discovery will place article releases. A longer backlog stays
 * discoverable and drains one article per day rather than being compressed.
 */
export const SCHEDULING_HORIZON_DAYS = 8;

export function startOfJstDay(date: Date): Date {
  const shifted = new Date(date.getTime() + JST_OFFSET_HOURS * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JST_OFFSET_HOURS * 60 * 60_000);
}

function slotAt(dayStart: Date, slot: SocialReleaseSlot): Date {
  return new Date(dayStart.getTime() + (slot.hour * 60 + slot.minute) * 60_000);
}

/**
 * Returns the next article-level release slot. `scheduled` contains one entry
 * per episode release, never one per platform/language lane.
 */
export function nextReleaseSlot(input: {
  after: Date;
  scheduled: readonly Date[];
  horizonDays?: number;
}): Date | null {
  const horizonDays = input.horizonDays ?? SCHEDULING_HORIZON_DAYS;
  const firstDay = startOfJstDay(input.after);

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dayStart = new Date(firstDay.getTime() + offset * DAY_MS);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const used = input.scheduled.filter(
      (at) => at >= dayStart && at < dayEnd,
    ).length;
    if (used >= SOCIAL_RELEASE_DAILY_CAP) continue;

    for (const slot of SOCIAL_RELEASE_SLOTS) {
      const candidate = slotAt(dayStart, slot);
      if (candidate < input.after) continue;
      if (input.scheduled.some((at) => at.getTime() === candidate.getTime())) {
        continue;
      }
      return candidate;
    }
  }
  return null;
}

/**
 * Whether an episode reserves its scheduled release day. Reconciliation can
 * bind a historical already-live post to a future queue row; that ghost row
 * must not consume a future article slot it never actually used.
 */
export function occupiesReleaseBudget(schedule: {
  status: string;
  scheduled_at: string;
  completed_at: string | null;
}): boolean {
  if (schedule.status !== 'completed' || !schedule.completed_at) return true;
  return (
    startOfJstDay(new Date(schedule.scheduled_at)).getTime() ===
    startOfJstDay(new Date(schedule.completed_at)).getTime()
  );
}

/** True inside the JST hours a person is around to watch a browser publish. */
export function withinPublishWindow(
  now: Date,
  window: { startHour: number; endHour: number },
): boolean {
  const jstHour = new Date(
    now.getTime() + JST_OFFSET_HOURS * 60 * 60_000,
  ).getUTCHours();
  return jstHour >= window.startHour && jstHour < window.endHour;
}
