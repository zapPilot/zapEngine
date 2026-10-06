import type { BeatId, Group } from './types.js';

// Each surface renders only its own sequence; order lives here, nowhere else.

/** The landing page, top to bottom. `contact` also carries the form. */
export const LANDING = [
  { id: 'hero', beats: ['hero'] },
  { id: 'whyCloudHard', beats: ['painPatient', 'painContent'] },
  { id: 'useCasePatient', beats: ['demoPatient'] },
  { id: 'useCaseContent', beats: ['demoImage'] },
  { id: 'howItWorks', beats: ['solution', 'beforeAfter', 'boundary'] },
  { id: 'familiar', beats: ['experience'] },
  { id: 'turnkey', beats: ['turnkey'] },
  { id: 'ownership', beats: ['ownership', 'updates'] },
  { id: 'startSmall', beats: ['startSmall'] },
  { id: 'contact', beats: ['pilot', 'cta'] },
] as const satisfies readonly Group[];

export type LandingSectionId = (typeof LANDING)[number]['id'];

/** The deck for doctors: one entry per slide. */
export const DOCTOR_DECK = [
  { id: 'cover', beats: ['hero'] },
  { id: 'pain-patient', beats: ['painPatient'] },
  { id: 'pain-content', beats: ['painContent'] },
  { id: 'desired', beats: ['desiredWorld'] },
  { id: 'solution', beats: ['solution'] },
  { id: 'before-after', beats: ['beforeAfter'] },
  { id: 'inside', beats: ['experience', 'boundary'] },
  { id: 'demos', beats: ['demoPatient', 'demoImage'] },
  { id: 'turnkey', beats: ['turnkey'] },
  { id: 'ownership', beats: ['ownership'] },
  { id: 'updates', beats: ['updates'] },
  { id: 'start-small', beats: ['startSmall'] },
  { id: 'pilot', beats: ['pilot'] },
  { id: 'cta', beats: ['cta'] },
] as const satisfies readonly Group[];

/** The partner deck: the doctor story up to the stack, then the partner ask. */
export const PARTNER_DECK = [
  ...DOCTOR_DECK.slice(0, 11),
  { id: 'partner-demand', beats: ['partnerDemand'] },
  { id: 'partner-gap', beats: ['partnerGap'] },
  { id: 'partner-roles', beats: ['partnerRoles'] },
  { id: 'partner-cta', beats: ['partnerCta'] },
] as const satisfies readonly Group[];

/** The film, scene by scene (apps/video/src/videos/kokode-clinic). */
export const FILM_ORDER = [
  { id: 'hook-patient', beats: ['painPatient'] },
  { id: 'hook-content', beats: ['painContent'] },
  { id: 'turn', beats: ['desiredWorld', 'solution', 'experience'] },
  { id: 'demo-patient', beats: ['beforeAfter', 'demoPatient'] },
  { id: 'demo-image', beats: ['demoImage'] },
  { id: 'reveal', beats: ['turnkey'] },
  { id: 'boundary', beats: ['boundary'] },
  { id: 'cta', beats: ['cta', 'hero'] },
] as const satisfies readonly Group[];

export type FilmBeatId = (typeof FILM_ORDER)[number]['beats'][number];

export type FilmSceneId = (typeof FILM_ORDER)[number]['id'];

const PAINS: readonly BeatId[] = ['painPatient', 'painContent'];
const ANSWERS: readonly BeatId[] = ['solution', 'desiredWorld'];
const ENDINGS: readonly BeatId[] = ['cta', 'partnerCta'];

/** Every sequence must show these; an inner list is "one of". */
export const REQUIRED_BEATS: readonly (readonly BeatId[])[] = [
  ['painPatient'],
  ['painContent'],
  ['solution'],
  ['boundary'],
  ['demoPatient'],
  ['demoImage'],
  ENDINGS,
];

/**
 * Story-arc rules shared by every surface: open on the hero or a pain, state
 * a pain before the answer, close on the ask, show every required beat once.
 */
export function arcViolations(groups: readonly Group[]): string[] {
  const violations: string[] = [];
  const beats = groups.reduce<BeatId[]>(
    (all, group) => all.concat(group.beats),
    [],
  );
  const first = groups[0];
  const last = groups[groups.length - 1];

  if (!first || !first.beats.some((b) => b === 'hero' || PAINS.includes(b))) {
    violations.push('opens without hero or a pain');
  }
  if (!last || !last.beats.some((b) => ENDINGS.includes(b))) {
    violations.push('closes without cta or partnerCta');
  }
  const firstPain = beats.findIndex((b) => PAINS.includes(b));
  const firstAnswer = beats.findIndex((b) => ANSWERS.includes(b));
  if (firstPain === -1 || (firstAnswer !== -1 && firstAnswer < firstPain)) {
    violations.push('states the answer before a pain');
  }
  for (const options of REQUIRED_BEATS) {
    if (!options.some((b) => beats.includes(b))) {
      violations.push(`misses ${options.join(' or ')}`);
    }
  }
  const seen = new Set<string>();
  for (const beat of beats) {
    if (seen.has(beat)) {
      violations.push(`repeats ${beat}`);
    }
    seen.add(beat);
  }
  const ids = new Set<string>();
  for (const group of groups) {
    if (group.beats.length === 0) {
      violations.push(`${group.id} is empty`);
    }
    if (ids.has(group.id)) {
      violations.push(`repeats group ${group.id}`);
    }
    ids.add(group.id);
  }
  return violations;
}
