import type { CaptureCheck } from '../../src/captures/types';

/** What the browser reported for a check's selector. */
export interface Observation {
  readonly text: string;
  readonly value: string | null;
  readonly pressed: string | null;
}

export interface CheckOutcome {
  readonly passed: readonly string[];
  readonly failures: readonly string[];
  readonly values: Readonly<Record<string, string>>;
}

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Compares one check against what the page showed. Pure, so the capture
 * script's only job is collecting observations.
 */
export function evaluateCheck(
  check: CaptureCheck,
  seen: Observation,
): CheckOutcome {
  const passed: string[] = [];
  const failures: string[] = [];
  const values: Record<string, string> = {};
  const text = normalise(seen.text);
  const verdict = (ok: boolean, claim: string, actual: string) =>
    ok
      ? passed.push(`${check.selector}: ${claim}`)
      : failures.push(`${check.selector}: expected ${claim}, saw ${actual}`);

  if (check.contains !== undefined) {
    const expected = normalise(check.contains);
    verdict(
      text.includes(expected),
      `text containing "${expected}"`,
      `"${text}"`,
    );
  }
  if (check.value !== undefined) {
    verdict(
      seen.value === check.value,
      `value "${check.value}"`,
      `"${seen.value ?? '(no value)'}"`,
    );
  }
  if (check.pressed !== undefined) {
    const expected = String(check.pressed);
    verdict(
      seen.pressed === expected,
      `aria-pressed=${expected}`,
      `aria-pressed=${seen.pressed ?? '(absent)'}`,
    );
  }
  if (check.record !== undefined) {
    const match = new RegExp(check.record.pattern).exec(text);
    const recorded = match?.[1];
    if (recorded === undefined) {
      failures.push(
        `${check.selector}: expected /${check.record.pattern}/, saw "${text}"`,
      );
    } else {
      values[check.record.name] = recorded;
      passed.push(`${check.selector}: ${check.record.name}=${recorded}`);
    }
  }
  return { passed, failures, values };
}
