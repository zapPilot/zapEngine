import { TextToSpeechClient } from '@google-cloud/text-to-speech';

import type { UsageCostLine } from '../cost.js';
import { resolveGcpClientOptions } from '../gcp-credentials.js';
import type { TtsMetadata, TtsSynthesizeOptions } from '../tts.js';
import { concatMp3Buffers } from './audio-concat.js';

type TextToSpeechClientOptions = ConstructorParameters<
  typeof TextToSpeechClient
>[0];

let client: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
  client ??= new TextToSpeechClient(getClientOptions());
  return client;
}

const MAX_BYTES = 4800;
const GOOGLE_WAVENET_PRICE_USD_PER_CHARACTER = 4 / 1_000_000;
const DEFAULT_GOOGLE_VOICE = {
  languageCode: 'cmn-TW',
  voiceName: 'cmn-TW-Wavenet-A',
} as const;

interface GoogleVoiceOptions {
  languageCode: string;
  voiceName: string;
}

export function getClientOptions(): TextToSpeechClientOptions | undefined {
  return resolveGcpClientOptions();
}

export function splitTextIntoChunks(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？])/);
  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence;
    if (Buffer.byteLength(testChunk, 'utf8') <= maxBytes) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (Buffer.byteLength(sentence, 'utf8') > maxBytes) {
        const sentenceChunks = splitOversizedSentence(sentence, maxBytes);
        chunks.push(...sentenceChunks.slice(0, -1));
        // splitOversizedSentence is called only for non-empty oversized sentences.
        /* v8 ignore start -- @preserve */
        currentChunk = sentenceChunks.at(-1) ?? '';
        /* v8 ignore stop -- @preserve */
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function splitOversizedSentence(sentence: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let chars = '';

  for (const char of sentence) {
    const testChar = chars + char;
    if (Buffer.byteLength(testChar, 'utf8') > maxBytes) {
      chunks.push(chars.trim());
      chars = char;
    } else {
      chars = testChar;
    }
  }

  // splitOversizedSentence is called only with non-empty sentence input.
  /* v8 ignore start -- @preserve */
  if (chars) {
    chunks.push(chars);
  }
  /* v8 ignore stop -- @preserve */

  return chunks;
}

export async function synthesizeChunk(
  text: string,
  voiceOptions: GoogleVoiceOptions = DEFAULT_GOOGLE_VOICE,
): Promise<Buffer> {
  const [response] = await getClient().synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: voiceOptions.languageCode,
      name: voiceOptions.voiceName,
    },
    audioConfig: { audioEncoding: 'MP3' },
  });

  if (!response?.audioContent) {
    throw new Error('Google TTS returned empty audio content');
  }

  return Buffer.from(response.audioContent as Uint8Array);
}

export async function concatenateAudioChunks(
  chunks: Buffer[],
): Promise<Buffer> {
  return concatMp3Buffers(chunks);
}

export function getMetadata(opts?: TtsSynthesizeOptions): TtsMetadata {
  const voiceOptions = getGoogleVoiceOptions(opts);
  return {
    provider: 'google',
    languageCode: voiceOptions.languageCode,
    voiceName: voiceOptions.voiceName,
  };
}

export async function synthesize(
  text: string,
  opts?: TtsSynthesizeOptions,
): Promise<{
  audio: Buffer;
  cost: UsageCostLine[];
}> {
  const voiceOptions = getGoogleVoiceOptions(opts);
  const chunks = splitTextIntoChunks(text, MAX_BYTES);

  if (chunks.length === 0) {
    throw new Error('No text to synthesize');
  }

  if (chunks.length === 1) {
    return {
      audio: await synthesizeChunkWithDiagnostics(
        chunks[0]!,
        0,
        chunks.length,
        voiceOptions,
      ),
      cost: [buildGoogleCostLine(chunks, voiceOptions, opts)],
    };
  }

  const audioBuffers = await Promise.all(
    chunks.map((chunk, index) =>
      synthesizeChunkWithDiagnostics(chunk, index, chunks.length, voiceOptions),
    ),
  );
  return {
    audio: await concatenateAudioChunks(audioBuffers),
    cost: [buildGoogleCostLine(chunks, voiceOptions, opts)],
  };
}

async function synthesizeChunkWithDiagnostics(
  chunk: string,
  index: number,
  total: number,
  voiceOptions: GoogleVoiceOptions,
): Promise<Buffer> {
  try {
    return await synthesizeChunk(chunk, voiceOptions);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const wrapped = new Error(
      [
        `Google TTS chunk ${index + 1}/${total} failed: ${err.message}`,
        `voice=${voiceOptions.voiceName}`,
        `language=${voiceOptions.languageCode}`,
        `bytes=${Buffer.byteLength(chunk, 'utf8')}`,
        `chars=${[...chunk].length}`,
        ...googleErrorDetails(error),
      ].join(' '),
      { cause: err },
    );
    copyGoogleErrorMetadata(error, wrapped);
    throw wrapped;
  }
}

function googleErrorDetails(error: unknown): string[] {
  if (!isRecord(error)) {
    return [];
  }

  const details: string[] = [];
  const code = error['code'];
  const grpcDetails = error['details'];
  const metadata = formatGrpcMetadata(error['metadata']);
  const dollarMetadata = formatGrpcMetadata(error['$metadata']);

  if (typeof code === 'number' || typeof code === 'string') {
    details.push(`code=${code}`);
  }
  if (typeof grpcDetails === 'string' && grpcDetails.length > 0) {
    details.push(`details=${grpcDetails}`);
  }
  if (metadata) {
    details.push(`metadata=${metadata}`);
  }
  if (dollarMetadata) {
    details.push(`$metadata=${dollarMetadata}`);
  }

  return details;
}

function copyGoogleErrorMetadata(error: unknown, target: Error): void {
  if (!isRecord(error)) {
    return;
  }

  const fields: Record<string, unknown> = {};
  for (const field of ['code', 'details', 'metadata', '$metadata']) {
    if (error[field] !== undefined) {
      fields[field] = error[field];
    }
  }
  Object.assign(target, fields);
}

function formatGrpcMetadata(metadata: unknown): string | null {
  if (isRecord(metadata) && typeof metadata['getMap'] === 'function') {
    return safeJsonStringify((metadata['getMap'] as () => unknown)());
  }

  return safeJsonStringify(metadata);
}

function safeJsonStringify(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getGoogleVoiceOptions(
  opts?: TtsSynthesizeOptions,
): GoogleVoiceOptions {
  if (!opts) {
    return DEFAULT_GOOGLE_VOICE;
  }

  if (opts.config.provider !== 'google') {
    throw new Error(
      `Google TTS received ${opts.config.provider} language config`,
    );
  }

  return {
    languageCode: opts.config.languageCode,
    voiceName: opts.config.voiceName,
  };
}

export function buildGoogleCostLine(
  chunks: string[],
  voiceOptions: GoogleVoiceOptions = DEFAULT_GOOGLE_VOICE,
  opts?: TtsSynthesizeOptions,
): UsageCostLine {
  const characters = chunks.reduce(
    (sum, chunk) => sum + countUnicodeCharacters(chunk),
    0,
  );

  return {
    category: 'tts',
    label: opts?.costLabel ?? 'TTS audio',
    provider: 'google',
    model: voiceOptions.voiceName,
    costUsd: characters * GOOGLE_WAVENET_PRICE_USD_PER_CHARACTER,
    usage: {
      unit: 'characters',
      quantity: characters,
      unitPriceUsd: GOOGLE_WAVENET_PRICE_USD_PER_CHARACTER,
    },
  };
}

function countUnicodeCharacters(text: string): number {
  return [...text].length;
}
