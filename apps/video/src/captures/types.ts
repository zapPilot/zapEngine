/**
 * A capture is a real screenshot of the product plus the measured boxes of the
 * elements a scene points the camera at. Selectors use Playwright syntax
 * (CSS, `text=…`, `role=button[name="…"]`).
 */
export type CaptureStep =
  | { readonly click: string }
  | { readonly focus: string }
  | { readonly waitFor: string };

/** A claim the screenshot must show; a failed check aborts the capture. */
export interface CaptureCheck {
  readonly selector: string;
  /** Visible text includes this (whitespace-normalised). */
  readonly contains?: string;
  /** `<input>` value equals this. */
  readonly value?: string;
  /** `aria-pressed` equals this. */
  readonly pressed?: boolean;
  /** Records the first group of `pattern` (matched against the text) as a value. */
  readonly record?: { readonly name: string; readonly pattern: string };
}

export type ShotFrame =
  /** Scroll so `scrollTo` sits `offset` CSS px below the top, then shoot the viewport. */
  | {
      readonly kind: 'viewport';
      readonly scrollTo: string;
      readonly offset: number;
    }
  /** Shoot one element plus `padding` CSS px, e.g. a panel that outgrows the viewport. */
  | {
      readonly kind: 'element';
      readonly selector: string;
      readonly padding: number;
    };

export interface ShotSpec {
  readonly steps?: readonly CaptureStep[];
  readonly frame: ShotFrame;
  /** Named elements whose boxes the scenes focus on. */
  readonly targets: Readonly<Record<string, string>>;
  readonly checks: readonly CaptureCheck[];
}

export interface ShotSet {
  /** Page path appended to the capture base URL. */
  readonly path: string;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Shots are taken at this pixel ratio so the camera can push in crisply. */
  readonly deviceScaleFactor: number;
  /** Ready condition for every shot, before its own steps. */
  readonly ready: string;
  readonly shots: Readonly<Record<string, ShotSpec>>;
}
