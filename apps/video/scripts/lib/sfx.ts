import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  SFX_KINDS,
  sfxFile,
  type SfxKind,
} from '../../src/primitives/sfx-kinds';
import { sampleAt } from './dsp';
import { type Pcm, writeWav } from './wav';

/**
 * An offline synthesiser for the sound effects scenes place on their frames
 * (ported from the WorkstyleOS promo kit). Deterministic: seeded noise and no
 * clock, so every prepare writes byte-identical files. Effects only; music
 * stays a registered, arranged loop.
 */
const SR = 48000;
const sec = (seconds: number) => Math.round(seconds * SR);
const dbGain = (db: number) => 10 ** (db / 20);
const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
/** Room after each effect, so tails never cut off at the file's end. */
const TAIL_SECONDS = 1;

/** Seeded white noise in [-1, 1): mulberry32. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

/** A topology-preserving state-variable band-pass, stable at any cutoff. */
function bandPass() {
  let ic1 = 0;
  let ic2 = 0;
  return (input: number, cutoff: number, q: number): number => {
    const g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return v1;
  };
}

/** Filtered noise whose band glides from `from` to `to` Hz under `shape`. */
function sweep(
  length: number,
  seed: number,
  from: number,
  to: number,
  shape: (u: number) => number,
  q: number,
): Float64Array {
  const out = new Float64Array(sec(length));
  const hiss = noise(seed);
  const band = bandPass();
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    out[i] = band(hiss(), from * (to / from) ** u, q) * shape(u);
  }
  return out;
}

/** A sine whose pitch and level follow functions of time, phase-continuous. */
function tone(
  length: number,
  hz: (t: number) => number,
  env: (t: number) => number,
): Float64Array {
  const out = new Float64Array(sec(length));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * phase) * env(t);
    phase = (phase + hz(t) / SR) % 1;
  }
  return out;
}

/** FM bell strikes, one per note. */
function bell(
  notes: readonly { readonly hz: number; readonly at: number }[],
  ratio: number,
  decay: number,
): Float64Array {
  const out = new Float64Array(sec(1.4));
  for (const { hz, at } of notes)
    for (let i = sec(at); i < out.length; i++) {
      const t = i / SR - at;
      const index = 1.4 * Math.exp(-t / 0.18);
      out[i] =
        sampleAt(out, i) +
        Math.sin(
          2 * Math.PI * hz * t + index * Math.sin(2 * Math.PI * hz * ratio * t),
        ) *
          Math.exp(-t / decay) *
          Math.min(1, t / 0.002);
    }
  return out;
}

/** Adds `source` into `target`, scaled. */
function mixInto(target: Float64Array, source: Float64Array, gain: number) {
  const end = Math.min(target.length, source.length);
  for (let i = 0; i < end; i++)
    target[i] = sampleAt(target, i) + sampleAt(source, i) * gain;
}

/** Freeverb's room (Jezar's tunings scaled to 48 kHz), one channel. */
function room(input: Float64Array, spread: number): Float64Array {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(
    (size) => ({
      buffer: new Float64Array(Math.round((size + spread) * scale)),
      index: 0,
      store: 0,
    }),
  );
  const passes = [556, 441, 341, 225].map((size) => ({
    buffer: new Float64Array(Math.round((size + spread) * scale)),
    index: 0,
  }));
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = sampleAt(input, i) * 0.015;
    let sum = 0;
    for (const line of combs) {
      const y = sampleAt(line.buffer, line.index);
      line.store = y * 0.75 + line.store * 0.25;
      line.buffer[line.index] = x + line.store * 0.84;
      line.index = (line.index + 1) % line.buffer.length;
      sum += y;
    }
    for (const pass of passes) {
      const buffered = sampleAt(pass.buffer, pass.index);
      pass.buffer[pass.index] = sum + buffered * 0.5;
      pass.index = (pass.index + 1) % pass.buffer.length;
      sum = buffered - sum;
    }
    out[i] = sum;
  }
  return out;
}

interface Voice {
  readonly sound: Float64Array;
  /** Level in the film, dB below full scale. */
  readonly db: number;
  /** Share of the voice sent to the room. */
  readonly verb: number;
  /** −1 (left) … 1 (right). */
  readonly pan: number;
}

const VOICES: Readonly<Record<SfxKind, () => Voice>> = {
  tap: () => {
    const click = tone(
      0.03,
      () => 2900,
      (t) => Math.exp(-t / 0.004),
    );
    mixInto(
      click,
      sweep(0.03, 11, 3500, 3500, (u) => Math.exp(-u * 12), 3),
      0.6,
    );
    return { sound: click, db: -22, verb: 0.05, pan: 0.1 };
  },
  type: () => ({
    sound: sweep(0.02, 12, 3200, 2600, (u) => Math.exp(-u * 10), 2.5),
    db: -25,
    verb: 0.02,
    pan: 0,
  }),
  whoosh: () => ({
    sound: sweep(0.5, 13, 500, 3800, (u) => Math.sin(Math.PI * u) ** 2, 1.2),
    db: -14,
    verb: 0.25,
    pan: 0,
  }),
  swish: () => ({
    sound: sweep(
      0.28,
      14,
      1400,
      7000,
      (u) => Math.sin(Math.PI * u) ** 1.5,
      1.4,
    ),
    db: -16,
    verb: 0.2,
    pan: -0.15,
  }),
  chime: () => ({
    sound: bell(
      [
        { hz: midiHz(84), at: 0 },
        { hz: midiHz(91), at: 0.075 },
      ],
      2,
      0.45,
    ),
    db: -17,
    verb: 0.45,
    pan: 0.15,
  }),
  beep: () => {
    const second = tone(
      0.16,
      () => midiHz(100),
      (t) => (t < 0.08 ? 0 : Math.exp(-(t - 0.08) / 0.05)),
    );
    mixInto(
      second,
      tone(
        0.07,
        () => midiHz(95),
        (t) => Math.min(1, t / 0.002) * (t < 0.06 ? 1 : 0),
      ),
      1,
    );
    return { sound: second, db: -19, verb: 0.15, pan: 0.05 };
  },
  impact: () => {
    const boom = tone(
      1.8,
      (t) => 32 + 58 * Math.exp(-t / 0.09),
      (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.55),
    );
    mixInto(
      boom,
      sweep(0.5, 15, 2400, 300, (u) => Math.exp(-u * 9), 0.8),
      0.8,
    );
    return { sound: boom, db: -6, verb: 0.5, pan: 0 };
  },
  pop: () => ({
    sound: tone(
      0.09,
      (t) => 520 + 760 * Math.exp(-t / 0.012),
      (t) => Math.min(1, t / 0.001) * Math.exp(-t / 0.03),
    ),
    db: -15,
    verb: 0.15,
    pan: 0,
  }),
  thud: () => {
    const low = tone(
      0.35,
      (t) => 55 + 70 * Math.exp(-t / 0.03),
      (t) => Math.exp(-t / 0.09),
    );
    mixInto(
      low,
      sweep(0.1, 16, 900, 400, (u) => Math.exp(-u * 8), 1.2),
      0.5,
    );
    return { sound: low, db: -11, verb: 0.12, pan: 0 };
  },
  riser: () => ({
    sound: sweep(1.6, 17, 280, 7200, (u) => u ** 2.2, 2.2),
    db: -15,
    verb: 0.4,
    pan: 0,
  }),
};

/** One effect as stereo PCM: panned dry signal plus its room, with a tail. */
export function synthesizeSfx(kind: SfxKind): Pcm {
  const voice = VOICES[kind]();
  const length = voice.sound.length + sec(TAIL_SECONDS);
  const dry = new Float64Array(length);
  mixInto(dry, voice.sound, dbGain(voice.db));
  const send = new Float64Array(length);
  mixInto(send, dry, voice.verb);
  const angle = ((voice.pan + 1) * Math.PI) / 4;
  const sides = [
    { gain: Math.cos(angle), spread: 0 },
    { gain: Math.sin(angle), spread: 23 },
  ];
  return {
    sampleRate: SR,
    channels: sides.map(({ gain, spread }) => {
      const wet = room(send, spread);
      return dry.map((value, i) => value * gain + sampleAt(wet, i));
    }),
  };
}

/** Writes every effect below `publicDir`; cheap and idempotent. */
export async function writeSfx(publicDir: string): Promise<void> {
  await mkdir(path.join(publicDir, 'sfx'), { recursive: true });
  for (const kind of SFX_KINDS)
    await writeFile(
      path.join(publicDir, sfxFile(kind)),
      writeWav(synthesizeSfx(kind)),
    );
}
