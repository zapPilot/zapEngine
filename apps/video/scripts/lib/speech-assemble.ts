import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { speechSpan } from './audio';
import { masterLine } from './master';
import { MEDIA_TOOLS, type MediaTools } from './media';
import { type SpeechPart, SPLICE_DETECT, SPLICE_KEEP_S } from './speech-plan';

export type AudioPart =
  | { kind: 'audio'; file: string; gainDb?: number }
  | { kind: 'pause'; ms: number };
/** Decode before measuring: PCM duration includes the exact end seen by the detector. */
export async function assembleLine(
  parts: readonly AudioPart[],
  scratch: string,
  target: string,
  keep = SPLICE_KEEP_S,
  tools: MediaTools = MEDIA_TOOLS,
): Promise<number[]> {
  if (
    !parts.length ||
    parts[0]?.kind !== 'audio' ||
    parts.at(-1)?.kind !== 'audio'
  )
    throw new Error('Line must begin and end with audio');
  if (!Number.isFinite(keep) || keep < 0)
    throw new Error('Invalid splice retention');
  const inputs: string[] = [];
  const chains: string[] = [];
  const labels: string[] = [];
  const gaps: number[] = [];
  let input = 0;
  for (const [index, part] of parts.entries()) {
    const label = `p${index}`;
    labels.push(`[${label}]`);
    if (part.kind === 'pause') {
      chains.push(
        `anullsrc=channel_layout=mono:sample_rate=48000,atrim=duration=${part.ms / 1000},asetpts=PTS-STARTPTS[${label}]`,
      );
      continue;
    }
    const pcm = path.join(scratch, `part-${index}.wav`);
    // Detection is applied to the decoded, resampled PCM emitted by this call.
    const stderr = await tools.run([
      '-y',
      '-i',
      part.file,
      '-af',
      `aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,${SPLICE_DETECT}`,
      '-c:a',
      'pcm_s16le',
      pcm,
    ]);
    const duration = await tools.duration(pcm);
    const span = speechSpan(stderr, duration);
    if (!span) throw new Error(`Silent speech part: ${part.file}`);
    const start = index === 0 ? 0 : Math.max(0, span.start - keep);
    const end =
      index === parts.length - 1
        ? duration
        : Math.min(duration, span.end + keep);
    inputs.push('-i', pcm);
    chains.push(
      `[${input++}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${part.gainDb ? `,volume=${part.gainDb}dB` : ''}[${label}]`,
    );
    if (index < parts.length - 1) {
      const next = parts[index + 1] as AudioPart;
      gaps.push(2 * keep + (next.kind === 'pause' ? next.ms / 1000 : 0));
    }
  }
  const raw = path.join(scratch, 'assembled.wav');
  chains.push(`${labels.join('')}concat=n=${parts.length}:v=0:a=1[out]`);
  await tools.run([
    '-y',
    ...inputs,
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[out]',
    '-c:a',
    'pcm_s16le',
    raw,
  ]);
  await masterLine(raw, target, tools);
  return gaps;
}
export interface SynthesisDeps {
  readonly scratch: string;
  readonly target: string;
  readonly publicDir: string;
  readonly synthesize: (text: string) => Promise<Buffer>;
  readonly keep?: number;
  readonly tools?: MediaTools;
}
export async function synthesizeLine(
  plan: readonly SpeechPart[],
  deps: SynthesisDeps,
): Promise<number[]> {
  const parts: AudioPart[] = [];
  for (const [index, part] of plan.entries()) {
    if (part.kind === 'pause') parts.push(part);
    else if (part.kind === 'clip')
      parts.push({
        kind: 'audio',
        file: path.resolve(deps.publicDir, part.clip.file),
        gainDb: part.clip.gainDb,
      });
    else {
      const file = path.join(deps.scratch, `tts-${index}.mp3`);
      await writeFile(file, await deps.synthesize(part.text));
      parts.push({ kind: 'audio', file });
    }
  }
  const [only] = parts;
  if (parts.length === 1 && only?.kind === 'audio') {
    await masterLine(only.file, deps.target, deps.tools);
    return [];
  }
  return assembleLine(parts, deps.scratch, deps.target, deps.keep, deps.tools);
}
