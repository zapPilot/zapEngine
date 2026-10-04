// The story is plain data shared by the landing page, both pitch decks and the
// Remotion film (apps/video imports it by relative path). Keep it portable:
// strings only, extensionless relative imports, ES2020, no runtime globals.
export type InterestId =
  | 'referral'
  | 'search'
  | 'materials'
  | 'voice'
  | 'other'
  | 'partner';

/** One idea of the story. Every surface renders beats; none owns copy. */
export type BeatId =
  | 'hero'
  | 'painPatient'
  | 'painContent'
  | 'desiredWorld'
  | 'solution'
  | 'beforeAfter'
  | 'experience'
  | 'boundary'
  | 'demoPatient'
  | 'demoImage'
  | 'turnkey'
  | 'startSmall'
  | 'pilot'
  | 'cta'
  | 'partnerDemand'
  | 'partnerGap'
  | 'partnerRoles'
  | 'partnerCta';

export type DisclaimerId =
  | 'normalOperation'
  | 'clinicalJudgment'
  | 'notReplacement'
  | 'preview'
  | 'screenImage'
  | 'fictionalPatient'
  | 'draftOnly';

/** Diagrams and demo screens; `src/site/figures.ts` and the film draw them. */
export type FigureId =
  | 'beforeAfter'
  | 'boundary'
  | 'experience'
  | 'demoPatient'
  | 'demoImage'
  | 'turnkey'
  | 'partnerRoles';

export interface Source {
  readonly label: string;
  readonly href: string;
}

export interface Point {
  readonly title: string;
  readonly text: string;
}

export interface Price {
  readonly label: string;
  readonly amount: string;
  readonly note: string;
}

export interface Action {
  readonly label: string;
  /** Preselects this option of the contact form. */
  readonly interest?: InterestId;
}

export interface Beat {
  /** Short label above the headline. */
  readonly eyebrow: string;
  /** Headline, one entry per rendered line. */
  readonly title: readonly string[];
  readonly body?: readonly string[];
  readonly points?: readonly Point[];
  readonly figure?: FigureId;
  /** Footnotes shown with the beat (demo figures carry their own). */
  readonly notes?: readonly DisclaimerId[];
  readonly source?: Source;
  readonly price?: Price;
  readonly action?: Action;
}

/** A section, slide or scene: the beats it shows, in order. */
export interface Group<Id extends string = string> {
  readonly id: Id;
  readonly beats: readonly BeatId[];
}

/** Same keys for translated copy, with strings widened from Japanese literals. */
export type CopyShape<T> = T extends string
  ? string
  : T extends readonly (infer V)[]
    ? readonly CopyShape<V>[]
    : T extends object
      ? { readonly [K in keyof T]: CopyShape<T[K]> }
      : T;
