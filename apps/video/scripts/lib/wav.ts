import { sampleAt } from './dsp';

export interface Pcm {
  readonly sampleRate: number;
  readonly channels: readonly Float64Array[];
}
/** Parse RIFF PCM16 with unknown chunks and padding; all decoding uses this format. */
export function readWav(buffer: Buffer): Pcm {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('Invalid WAV');
  let rate = 0,
    channels = 0,
    data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const name = buffer.toString('ascii', offset, offset + 4),
      size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length)
      throw new Error('Truncated WAV chunk');
    if (name === 'fmt ') {
      if (
        size < 16 ||
        buffer.readUInt16LE(offset + 8) !== 1 ||
        buffer.readUInt16LE(offset + 22) !== 16
      )
        throw new Error('WAV requires PCM16');
      channels = buffer.readUInt16LE(offset + 10);
      rate = buffer.readUInt32LE(offset + 12);
    }
    if (name === 'data') data = buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!data || rate < 1 || channels < 1 || data.length % (channels * 2))
    throw new Error('Invalid WAV format/data');
  const frames = data.length / channels / 2;
  const result = Array.from(
    { length: channels },
    () => new Float64Array(frames),
  );
  for (const [c, channel] of result.entries())
    for (let i = 0; i < frames; i++)
      channel[i] = data.readInt16LE((i * channels + c) * 2) / 32768;
  return { sampleRate: rate, channels: result };
}
export function writeWav(pcm: Pcm): Buffer {
  const frames = pcm.channels[0]?.length;
  if (
    !frames ||
    pcm.sampleRate < 1 ||
    pcm.channels.some((c) => c.length !== frames)
  )
    throw new Error('Invalid PCM');
  const count = pcm.channels.length,
    buffer = Buffer.alloc(44 + frames * count * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(count, 22);
  buffer.writeUInt32LE(pcm.sampleRate, 24);
  buffer.writeUInt32LE(pcm.sampleRate * count * 2, 28);
  buffer.writeUInt16LE(count * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(buffer.length - 44, 40);
  for (let i = 0; i < frames; i++)
    for (const [c, channel] of pcm.channels.entries())
      buffer.writeInt16LE(
        Math.round(
          Math.min(32767 / 32768, Math.max(-1, sampleAt(channel, i))) * 32768,
        ),
        44 + (i * count + c) * 2,
      );
  return buffer;
}

export function stereoMono(pcm: Pcm): Float64Array {
  if (pcm.channels.length !== 2) throw new Error('Stereo PCM required');
  const [left, right] = pcm.channels as readonly [Float64Array, Float64Array];
  if (left.length !== right.length)
    throw new Error('Stereo channel lengths differ');
  return Float64Array.from(
    left,
    (value, i) => (value + sampleAt(right, i)) / 2,
  );
}
