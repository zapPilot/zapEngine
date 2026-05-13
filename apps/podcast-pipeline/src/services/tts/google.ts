import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { TextToSpeechClient } from '@google-cloud/text-to-speech';

import { ffmpeg } from '../../lib/ffmpeg.js';
import type { TtsMetadata } from '../tts.js';

type TextToSpeechClientOptions = ConstructorParameters<
  typeof TextToSpeechClient
>[0];

let client: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
  client ??= new TextToSpeechClient(getClientOptions());
  return client;
}

const MAX_BYTES = 4800;

export function getClientOptions(): TextToSpeechClientOptions | undefined {
  const rawCredentials = process.env['GOOGLE_APPLICATION_CREDENTIALS_BASE64'];
  const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS']?.trim();
  if (!rawCredentials) {
    return credentialsPath ? { keyFilename: credentialsPath } : undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawCredentials, 'base64').toString('utf8'));
  } catch {
    throw new Error(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: expected base64-encoded service account JSON',
    );
  }

  if (!isServiceAccountCredentials(parsed)) {
    throw new Error(
      'Invalid GOOGLE_APPLICATION_CREDENTIALS_BASE64: service account JSON must include client_email, private_key, and project_id',
    );
  }

  return {
    credentials: parsed,
    projectId: parsed.project_id,
  };
}

function isServiceAccountCredentials(value: unknown): value is {
  client_email: string;
  private_key: string;
  project_id: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { client_email?: unknown }).client_email === 'string' &&
    typeof (value as { private_key?: unknown }).private_key === 'string' &&
    typeof (value as { project_id?: unknown }).project_id === 'string'
  );
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
        currentChunk = sentenceChunks.at(-1) ?? '';
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

  if (chars) {
    chunks.push(chars);
  }

  return chunks;
}

export async function synthesizeChunk(text: string): Promise<Buffer> {
  const languageCode = process.env['GOOGLE_TTS_LANGUAGE_CODE'] || 'cmn-TW';
  const name = process.env['GOOGLE_TTS_VOICE_NAME'] || 'cmn-TW-Wavenet-A';

  const [response] = await getClient().synthesizeSpeech({
    input: { text },
    voice: { languageCode, name },
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
  if (chunks.length === 1) {
    return chunks[0]!;
  }

  const tempDir = tmpdir();
  const inputFiles: string[] = [];
  const outputFile = `${tempDir}/tts_${randomUUID()}.mp3`;

  try {
    for (const chunk of chunks) {
      const inputFile = `${tempDir}/chunk_${randomUUID()}.mp3`;
      writeFileSync(inputFile, chunk);
      inputFiles.push(inputFile);
    }

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();
      inputFiles.forEach((file) => (command = command.input(file)));
      const filterExpr = 'concat=n=' + inputFiles.length + ':v=0:a=1';
      command
        .complexFilter(filterExpr)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(outputFile);
    });

    const { readFileSync } = await import('node:fs');
    const result = readFileSync(outputFile);
    return result;
  } finally {
    for (const file of inputFiles) {
      try {
        unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(outputFile);
    } catch {
      /* ignore */
    }
  }
}

export function getMetadata(): TtsMetadata {
  return {
    provider: 'google',
    languageCode: process.env['GOOGLE_TTS_LANGUAGE_CODE'] || 'cmn-TW',
    voiceName: process.env['GOOGLE_TTS_VOICE_NAME'] || 'cmn-TW-Wavenet-A',
  };
}

export async function synthesize(text: string): Promise<Buffer> {
  const chunks = splitTextIntoChunks(text, MAX_BYTES);

  if (chunks.length === 0) {
    throw new Error('No text to synthesize');
  }

  if (chunks.length === 1) {
    return synthesizeChunk(chunks[0]!);
  }

  const audioBuffers = await Promise.all(
    chunks.map((chunk) => synthesizeChunk(chunk)),
  );
  return concatenateAudioChunks(audioBuffers);
}
