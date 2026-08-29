import { getOrCreateExperimentAssignment } from './experiments.js';
import type { SocialPlatform } from './platforms.js';
import { PLATFORM_PUBLISH_POLICY, type SocialPublishSlot } from './policy.js';
import type { SocialLanguageCode } from './types.js';

const JST_OFFSET_HOURS = 9;
const DAY_MS = 24 * 60 * 60_000;

/**
 * How far ahead discovery will place work. A backlog longer than this is not
 * dropped and not burst-published: the lanes simply stay undiscovered until a
 * later tick, and `listSocialPublishCandidates` re-offers them in the same
 * `ready_at` order, so the queue drains a day at a time.
 */
export const SCHEDULING_HORIZON_DAYS = 8;

export const REDNOTE_SLOT_EXPERIMENT = 'rednote-slot-v1';
export const THREADS_SLOT_EXPERIMENT = 'threads-timing-v1';

/**
 * Explore/exploit written as the variant list itself. `deterministicVariant`
 * buckets uniformly over the array it is given, so four copies of the primary
 * slot against one of the alternate *is* the 80/20 split -- there is no
 * exploration-rate constant that could drift away from what actually shipped.
 *
 * Threads has no incumbent to protect: both times are unmeasured, so it splits
 * evenly until the experiment report says otherwise.
 */
const REDNOTE_SLOT_VARIANTS = ['1430', '1430', '1430', '1430', '1200'] as const;
const THREADS_SLOT_VARIANTS = ['0930', '1200'] as const;

export function startOfJstDay(date: Date): Date {
  const shifted = new Date(date.getTime() + JST_OFFSET_HOURS * 60 * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JST_OFFSET_HOURS * 60 * 60_000);
}

function jstDayIndex(dayStart: Date): number {
  return Math.round(
    (dayStart.getTime() + JST_OFFSET_HOURS * 60 * 60_000) / DAY_MS,
  );
}

function slotAt(dayStart: Date, slot: SocialPublishSlot): Date {
  return new Date(dayStart.getTime() + (slot.hour * 60 + slot.minute) * 60_000);
}

function slotLabel(slot: SocialPublishSlot): string {
  return `${String(slot.hour).padStart(2, '0')}${String(slot.minute).padStart(2, '0')}`;
}

// Resolved against the policy rather than hard-coded, so removing a slot from
// PLATFORM_PUBLISH_POLICY fails loudly here instead of scheduling into a time
// the policy no longer allows.
function policySlot(
  platform: SocialPlatform,
  label: string,
): SocialPublishSlot {
  const slot = PLATFORM_PUBLISH_POLICY[platform].slots.find(
    (candidate) => slotLabel(candidate) === label,
  );
  if (!slot) {
    throw new Error(`${platform} has no ${label} slot in its publish policy.`);
  }
  return slot;
}

/**
 * Which slot one lane may take on a given JST day, or `null` when the day has
 * none for it. Only X answers differently day to day.
 */
export interface LaneSlotPlan {
  slotOnDay(dayStart: Date): SocialPublishSlot | null;
}

function fixedSlot(slot: SocialPublishSlot): LaneSlotPlan {
  return { slotOnDay: () => slot };
}

/**
 * X posts twice a day in two languages, and the pair swaps times every day.
 *
 * Holding a language to one time forever confounds it with that time: a
 * language that reaches fewer people at 12:15 is indistinguishable from 12:15
 * reaching fewer people. Alternating means each language is measured at both
 * times over a week, and the two effects separate.
 */
function crossoverPlan(language: SocialLanguageCode): LaneSlotPlan {
  const [early, late] = PLATFORM_PUBLISH_POLICY.x.slots;
  return {
    slotOnDay: (dayStart) => {
      const earlyLanguage = jstDayIndex(dayStart) % 2 === 0 ? 'ja' : 'en';
      return language === earlyLanguage ? early : late;
    },
  };
}

/**
 * Assigns this episode's lane a slot, persisting the timing experiments so a
 * report can attribute reach to the time it actually published at.
 */
export async function resolveLaneSlotPlan(input: {
  platform: SocialPlatform;
  episodeId: string;
  language: SocialLanguageCode;
}): Promise<LaneSlotPlan> {
  if (input.platform === 'x') return crossoverPlan(input.language);
  if (input.platform === 'youtube') {
    return fixedSlot(PLATFORM_PUBLISH_POLICY.youtube.slots[0]);
  }

  const experimentKey =
    input.platform === 'rednote'
      ? REDNOTE_SLOT_EXPERIMENT
      : THREADS_SLOT_EXPERIMENT;
  const variants =
    input.platform === 'rednote'
      ? REDNOTE_SLOT_VARIANTS
      : THREADS_SLOT_VARIANTS;
  const assignment = await getOrCreateExperimentAssignment({
    experimentKey,
    episodeId: input.episodeId,
    variants,
  });
  return fixedSlot(policySlot(input.platform, assignment.variant));
}

/**
 * The first slot this lane can take without exceeding its platform's daily cap.
 *
 * The cap is counted per JST day across every language, which is what stops a
 * multilingual platform from publishing once per language and calling it one
 * post. Returns `null` when nothing fits inside the horizon; the caller leaves
 * the lane unqueued rather than compressing the schedule to fit it.
 */
export function nextBudgetSlot(input: {
  platform: SocialPlatform;
  plan: LaneSlotPlan;
  after: Date;
  scheduled: readonly Date[];
  horizonDays?: number;
}): Date | null {
  const { dailyCap } = PLATFORM_PUBLISH_POLICY[input.platform];
  const horizonDays = input.horizonDays ?? SCHEDULING_HORIZON_DAYS;
  const firstDay = startOfJstDay(input.after);

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dayStart = new Date(firstDay.getTime() + offset * DAY_MS);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const used = input.scheduled.filter(
      (at) => at >= dayStart && at < dayEnd,
    ).length;
    if (used >= dailyCap) continue;

    const slot = input.plan.slotOnDay(dayStart);
    if (!slot) continue;
    const candidate = slotAt(dayStart, slot);
    if (candidate < input.after) continue;
    if (input.scheduled.some((at) => at.getTime() === candidate.getTime())) {
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * Whether a scheduled row reserves a day of its platform's budget.
 *
 * A completed row only ever spent budget on the day it actually published.
 * Reconciliation binds an already-live post to a job without moving that job's
 * `scheduled_at`, which is how twenty rows dated 9/1-9/4 came to carry an
 * 08-19 `completed_at`: counting those would reserve four future days for
 * posts that went out a fortnight earlier.
 */
export function occupiesPublishBudget(schedule: {
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
