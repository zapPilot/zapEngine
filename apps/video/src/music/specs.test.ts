import { expect, it } from 'vitest';

import { musicLibrary } from './library';
import { isLoopSpecId, LOOP_IDS, LOOP_SPECS, type LoopSpec } from './specs';

it('registers every cut loop and keeps a prompt for loops still awaiting a clip', () => {
  for (const id of Object.keys(musicLibrary)) expect(LOOP_IDS).toContain(id);
  for (const id of LOOP_IDS) {
    const spec: LoopSpec = LOOP_SPECS[id];
    if (!Object.hasOwn(musicLibrary, id)) expect(spec.prompt).toBeTruthy();
  }
});

it('recognises only registered loop ids', () => {
  expect(isLoopSpecId('gentle-88')).toBe(true);
  expect(isLoopSpecId('launch-120')).toBe(true);
  expect(isLoopSpecId('unknown')).toBe(false);
  expect(isLoopSpecId(undefined)).toBe(false);
});

it('asks for instrumental music only', () => {
  expect(LOOP_SPECS['launch-120'].prompt).toMatch(/^Instrumental only/);
  expect(LOOP_SPECS['launch-120'].prompt).toContain('120 BPM');
});
