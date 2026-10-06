import { loudnormFilter, parseLoudnorm, speechBounds } from './audio';
import { MEDIA_TOOLS, type MediaTools } from './media';

/** Raw TTS bytes → speech-trimmed, −16 LUFS MP3 at `target`. */
export async function masterLine(
  raw: string,
  target: string,
  tools: MediaTools = MEDIA_TOOLS,
): Promise<void> {
  const seconds = await tools.duration(raw);
  const silence = await tools.run([
    '-i',
    raw,
    '-af',
    'silencedetect=noise=-45dB:d=0.08',
    '-f',
    'null',
    '-',
  ]);
  const { start, end } = speechBounds(silence, seconds);
  const trim = `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS`;
  const measured = parseLoudnorm(
    await tools.run([
      '-i',
      raw,
      '-af',
      `${trim},${loudnormFilter()}`,
      '-f',
      'null',
      '-',
    ]),
  );
  await tools.run([
    '-y',
    '-i',
    raw,
    '-af',
    `${trim},${loudnormFilter(measured)}`,
    '-ar',
    '48000',
    '-ac',
    '1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    target,
  ]);
}
