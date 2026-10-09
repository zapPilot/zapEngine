/**
 * Name and hint hygiene for LLM visual-subject catalogs.
 *
 * A subject name is one ASCII letter (a brand such as "X") or two to eighty
 * characters that contain a letter or digit. An identity hint is two to eighty
 * characters that contain a letter or digit. One cleaning routine serves
 * aliases, identity hints and negative hints in both the compact-catalog judge
 * and the strict parse, so the policy is stated once. Nothing here lengthens,
 * truncates or invents a name: an entry either survives as written or is
 * dropped and recorded.
 */

const MAX_NAME_CHARACTERS = 80;
const ASCII_LETTER = /^[A-Za-z]$/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export const SUBJECT_NAME_FIELDS = [
  'aliases',
  'identityHints',
  'negativeHints',
] as const;
export type SubjectNameField = (typeof SUBJECT_NAME_FIELDS)[number];

export const SUBJECT_NAME_REPAIR_KINDS = [
  'dropped-invalid',
  'dropped-duplicate',
  'dropped-ungrounded',
] as const;
export type SubjectNameRepairKind = (typeof SUBJECT_NAME_REPAIR_KINDS)[number];

/** One entry removed from a subject's list. `value` is the clipped text that was dropped. */
export interface SubjectNameRepair {
  id: string;
  field: SubjectNameField;
  kind: SubjectNameRepairKind;
  value: string;
}

/** NFKC, collapsed whitespace and trimmed: the one spelling a name or hint is compared in. */
export function tidyName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function isSingleLetterName(value: string): boolean {
  return ASCII_LETTER.test(tidyName(value));
}

export function isUsableVisualSubjectName(value: string): boolean {
  const name = tidyName(value);
  if (name.length === 1) return ASCII_LETTER.test(name);
  return (
    name.length >= 2 &&
    name.length <= MAX_NAME_CHARACTERS &&
    LETTER_OR_DIGIT.test(name)
  );
}

export function isUsableHint(value: string): boolean {
  const hint = tidyName(value);
  return (
    hint.length >= 2 &&
    hint.length <= MAX_NAME_CHARACTERS &&
    LETTER_OR_DIGIT.test(hint)
  );
}

/** The `id` a repair is filed under: the subject's own id, clipped, or `unknown`. */
export function subjectLabel(id: string): string {
  return id.trim().slice(0, MAX_NAME_CHARACTERS) || 'unknown';
}

/**
 * Whether `letter` appears in `text` as its own token: not glued to another
 * ASCII letter or digit, and matched case-sensitively. "X平台" and "X.com" name
 * the brand; "next", "10X", "X86" and a lowercase "x402" do not.
 */
export function containsExactLetterToken(
  text: string,
  letter: string,
): boolean {
  if (!isSingleLetterName(letter)) return false;
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${tidyName(letter)}(?![A-Za-z0-9])`,
    'u',
  );
  return pattern.test(text.normalize('NFKC'));
}

/**
 * Cleans one list of aliases or hints. Invalid entries and repeats are dropped
 * and reported, and the survivors keep their order. Callers cap the result
 * afterwards, so an invalid entry can never push a valid one past the bound.
 */
export function cleanSubjectNameList(
  values: readonly unknown[],
  options: { usable: (name: string) => boolean; exclude?: readonly string[] },
): {
  names: string[];
  repairs: { kind: SubjectNameRepairKind; value: string }[];
} {
  const seen = new Set((options.exclude ?? []).map(nameKey));
  const names: string[] = [];
  const repairs: { kind: SubjectNameRepairKind; value: string }[] = [];
  for (const value of values) {
    const name = typeof value === 'string' ? tidyName(value) : '';
    if (!options.usable(name)) {
      repairs.push({
        kind: 'dropped-invalid',
        value: name.slice(0, MAX_NAME_CHARACTERS),
      });
      continue;
    }
    const key = nameKey(name);
    if (seen.has(key)) {
      repairs.push({ kind: 'dropped-duplicate', value: name });
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return { names, repairs };
}

/**
 * Cleans one list field of a subject and files each removal under that subject.
 * Returns null when the field is not an array at all, so the caller can leave
 * the bad shape for the strict schema to reject rather than hide it.
 */
export function cleanSubjectNameField(
  value: unknown,
  field: SubjectNameField,
  subjectId: string,
  options: { usable: (name: string) => boolean; exclude?: readonly string[] },
  repairs: SubjectNameRepair[],
): string[] | null {
  if (!Array.isArray(value)) return null;
  const cleaned = cleanSubjectNameList(value, options);
  for (const repair of cleaned.repairs) {
    repairs.push({ id: subjectId, field, ...repair });
  }
  return cleaned.names;
}

function nameKey(name: string): string {
  return tidyName(name).toLocaleLowerCase('en-US');
}
