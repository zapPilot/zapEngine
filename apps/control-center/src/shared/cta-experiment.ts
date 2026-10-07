export interface CtaCounts {
  exposed: number;
  visible: number;
  clicked: number;
  opened: number;
  started: number;
  attempted: number;
  acknowledged: number;
  confirmed: number | null;
  errors: number;
  closedWithoutSubmit: number;
}
export interface CtaExperimentReading {
  key: string;
  status: 'ok' | 'unavailable';
  message: string | null;
  observedAt: string;
  windowDays: 30;
  conversionWindowHours: 24;
  readiness: 'awaiting_data' | 'inconclusive' | 'review_ready';
  excludedImmature: number;
  excludedMultipleVariants: number;
  visibilityUnmeasurable: number;
  truncated: boolean;
  sources: { posthog: 'ok' | 'unavailable'; waitlist: 'ok' | 'unavailable' };
  variants: Array<CtaCounts & { variant: string }>;
  segments: Array<
    CtaCounts & { variant: string; source: string; device: string }
  >;
  failures: Array<{ reason: string; people: number }>;
  clickLocations: Array<{ location: string; people: number }>;
  caveats: string[];
}
