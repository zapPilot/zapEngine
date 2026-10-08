export interface Group {
  id: string;
  beats: readonly string[];
}
export interface Arc {
  opening: readonly string[];
  pains: readonly string[];
  answers: readonly string[];
  endings: readonly string[];
  required: readonly (readonly string[])[];
  repeatable: readonly string[];
}
export function arcViolations(groups: readonly Group[], arc: Arc): string[] {
  const violations: string[] = [];
  const beats = groups.flatMap((group) => group.beats);
  if (!groups[0]?.beats.some((beat) => arc.opening.includes(beat))) {
    violations.push('opens without an opening beat');
  }
  if (!groups.at(-1)?.beats.some((beat) => arc.endings.includes(beat))) {
    violations.push('closes without an ask');
  }
  const pain = beats.findIndex((beat) => arc.pains.includes(beat));
  const answer = beats.findIndex((beat) => arc.answers.includes(beat));
  if (pain === -1 || (answer !== -1 && answer < pain)) {
    violations.push('states the answer before a pain');
  }
  for (const options of arc.required) {
    if (!options.some((beat) => beats.includes(beat))) {
      violations.push(`misses ${options.join(' or ')}`);
    }
  }
  const seen = new Set<string>();
  for (const beat of beats) {
    if (seen.has(beat) && !arc.repeatable.includes(beat)) {
      violations.push(`repeats ${beat}`);
    }
    seen.add(beat);
  }
  const ids = new Set<string>();
  for (const group of groups) {
    if (!group.beats.length) {
      violations.push(`${group.id} is empty`);
    }
    if (ids.has(group.id)) {
      violations.push(`repeats group ${group.id}`);
    }
    ids.add(group.id);
  }
  return violations;
}
