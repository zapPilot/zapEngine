import type { UsageCostLine } from '../cost.js';
import type {
  TtsMetadata,
  TtsSynthesisResult,
  TtsSynthesizeOptions,
} from '../tts.js';
import { concatMp3Buffers } from './audio-concat.js';
import type { FishAudioTtsLanguageConfig } from './tts-config.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const FISH_AUDIO_PRICE_USD_PER_MILLION_UTF8_BYTES = 15;
const FISH_AUDIO_PRICE_USD_PER_UTF8_BYTE =
  FISH_AUDIO_PRICE_USD_PER_MILLION_UTF8_BYTES / 1_000_000;
const ERROR_BODY_LIMIT = 300;
const MAX_FISH_AUDIO_TTS_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 600_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CHARS_PER_REQUEST = 500;
const DEFAULT_REQUEST_DELAY_MS = 100;
const PROGRESS_BAR_WIDTH = 20;
const RETRYABLE_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

export async function synthesize(
  text: string,
  opts: TtsSynthesizeOptions,
): Promise<TtsSynthesisResult> {
  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error('FISH_AUDIO_API_KEY is required for Fish Audio TTS');
  }

  const config = getFishAudioConfig(opts);
  const maxChars = getMaxCharsPerRequest();
  const requestDelayMs = getRequestDelayMs();
  const chunks = splitTextIntoChunks(text, maxChars);
  const progress = createFishAudioProgressContext({
    languageCode: opts.languageCode,
    model: config.engine,
    totalCharacters: text.length,
    totalChunks: chunks.length,
    maxCharsPerChunk: maxChars,
    requestDelayMs,
  });

  if (chunks.length === 1) {
    const audio = await synthesizeChunkWithRetry(
      apiKey,
      chunks[0]!,
      config,
      opts.languageCode,
      1,
      1,
    );
    logFishAudioProgress(progress, {
      completedChunks: 1,
      completedCharacters: text.length,
      completedAudioBytes: audio.length,
    });
    return {
      audio,
      cost: [buildFishAudioCostLine(text, opts)],
    };
  }

  console.log('[/tts] Fish Audio TTS text chunked', {
    languageCode: opts.languageCode,
    model: config.engine,
    totalCharacters: text.length,
    chunkCount: chunks.length,
    maxCharsPerChunk: maxChars,
    requestDelayMs,
  });

  const audioBuffers: Buffer[] = [];
  let completedCharacters = 0;
  let completedAudioBytes = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    if (i > 0) {
      await sleep(requestDelayMs);
    }
    const chunkText = chunks[i]!;
    const chunkAudio = await synthesizeChunkWithRetry(
      apiKey,
      chunkText,
      config,
      opts.languageCode,
      i + 1,
      chunks.length,
    );
    audioBuffers.push(chunkAudio);
    completedCharacters += chunkText.length;
    completedAudioBytes += chunkAudio.length;
    logFishAudioProgress(progress, {
      completedChunks: i + 1,
      completedCharacters,
      completedAudioBytes,
    });
  }

  console.log('[/tts] Fish Audio TTS concat started', {
    languageCode: opts.languageCode,
    model: config.engine,
    chunkCount: audioBuffers.length,
    audioBytes: completedAudioBytes,
  });
  const audio = await concatMp3Buffers(audioBuffers);
  console.log('[/tts] Fish Audio TTS concat finished', {
    languageCode: opts.languageCode,
    model: config.engine,
    chunkCount: audioBuffers.length,
    audioBytes: audio.length,
  });

  return {
    audio,
    cost: [buildFishAudioCostLine(text, opts)],
  };
}

export function getMetadata(opts: TtsSynthesizeOptions): TtsMetadata {
  const config = getFishAudioConfig(opts);
  return {
    provider: 'fish-audio',
    languageCode: opts.languageCode,
    voiceName: config.modelId,
  };
}

function getFishAudioConfig(
  opts: TtsSynthesizeOptions,
): FishAudioTtsLanguageConfig {
  if (opts.config.provider !== 'fish-audio') {
    throw new Error(
      `Fish Audio TTS received ${opts.config.provider} language config`,
    );
  }

  return opts.config;
}

interface FishAudioProgressContext {
  languageCode: string;
  model: string;
  totalCharacters: number;
  totalChunks: number;
  maxCharsPerChunk: number;
  requestDelayMs: number;
  startedAtMs: number;
}

function createFishAudioProgressContext(opts: {
  languageCode: string;
  model: string;
  totalCharacters: number;
  totalChunks: number;
  maxCharsPerChunk: number;
  requestDelayMs: number;
}): FishAudioProgressContext {
  return {
    ...opts,
    startedAtMs: Date.now(),
  };
}

function logFishAudioProgress(
  context: FishAudioProgressContext,
  progress: {
    completedChunks: number;
    completedCharacters: number;
    completedAudioBytes: number;
  },
): void {
  const elapsedMs = Date.now() - context.startedAtMs;
  const safeCompletedChunks = Math.max(progress.completedChunks, 1);
  const remainingChunks = Math.max(
    context.totalChunks - progress.completedChunks,
    0,
  );
  const averageMsPerChunk = elapsedMs / safeCompletedChunks;
  const etaMs =
    remainingChunks * averageMsPerChunk +
    remainingChunks * context.requestDelayMs;
  const percent = Math.round(
    (progress.completedChunks / context.totalChunks) * 100,
  );

  console.log('[/tts] Fish Audio TTS progress', {
    languageCode: context.languageCode,
    model: context.model,
    progress: `${buildProgressBar(percent)} ${progress.completedChunks}/${context.totalChunks} ${percent}%`,
    completedChunks: progress.completedChunks,
    totalChunks: context.totalChunks,
    completedCharacters: progress.completedCharacters,
    totalCharacters: context.totalCharacters,
    completedAudioBytes: progress.completedAudioBytes,
    elapsed: formatDurationMs(elapsedMs),
    eta:
      progress.completedChunks >= context.totalChunks
        ? '0s'
        : formatDurationMs(etaMs),
    averageChunk: formatDurationMs(averageMsPerChunk),
    maxCharsPerChunk: context.maxCharsPerChunk,
    requestDelayMs: context.requestDelayMs,
  });
}

function buildProgressBar(percent: number): string {
  const clampedPercent = Math.max(0, Math.min(percent, 100));
  const filledWidth = Math.round((clampedPercent / 100) * PROGRESS_BAR_WIDTH);
  return `[${'#'.repeat(filledWidth)}${'-'.repeat(PROGRESS_BAR_WIDTH - filledWidth)}]`;
}

function formatDurationMs(ms: number): string {
  const seconds = Math.max(Math.round(ms / 1_000), 0);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

async function synthesizeChunkWithRetry(
  apiKey: string,
  text: string,
  config: FishAudioTtsLanguageConfig,
  languageCode: string,
  chunkIndex: number,
  totalChunks: number,
): Promise<Buffer> {
  for (let attempt = 1; attempt <= MAX_FISH_AUDIO_TTS_ATTEMPTS; attempt += 1) {
    try {
      const audioBuffer = await fetchSingleChunk(
        apiKey,
        text,
        config,
        languageCode,
        chunkIndex,
        totalChunks,
        attempt,
      );
      return Buffer.from(audioBuffer);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err instanceof NonRetryableFishAudioError) {
        throw err;
      }
      if (attempt === MAX_FISH_AUDIO_TTS_ATTEMPTS) {
        throw err;
      }

      console.warn('[/tts] Fish Audio TTS retrying chunk after error', {
        attempt,
        maxAttempts: MAX_FISH_AUDIO_TTS_ATTEMPTS,
        chunkIndex,
        totalChunks,
        languageCode,
        model: config.engine,
        message: err.message,
      });
      await sleep(
        err instanceof TransientError
          ? err.retryDelayMs
          : getRetryDelayMs(null, attempt),
      );
    }
  }

  throw new Error('Fish Audio TTS chunk retry loop exhausted unexpectedly');
}

async function fetchSingleChunk(
  apiKey: string,
  text: string,
  config: FishAudioTtsLanguageConfig,
  languageCode: string,
  chunkIndex: number,
  totalChunks: number,
  attempt: number,
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const totalTimeout = setTimeout(
    () => controller.abort(),
    getRequestTimeoutMs(),
  );

  let idleTimeout: ReturnType<typeof setTimeout> | undefined;

  try {
    console.log('[/tts] Fish Audio TTS request started', {
      attempt,
      maxAttempts: MAX_FISH_AUDIO_TTS_ATTEMPTS,
      languageCode,
      model: config.engine,
      textCharacters: text.length,
      chunkIndex,
      totalChunks,
    });

    const response = await fetchFishAudio(
      apiKey,
      text,
      config,
      controller.signal,
    );

    console.log('[/tts] Fish Audio TTS response received', {
      attempt,
      status: response.status,
      languageCode,
      model: config.engine,
      chunkIndex,
      totalChunks,
    });

    if (!response.ok) {
      if (
        !isRetryableStatus(response.status) ||
        attempt === MAX_FISH_AUDIO_TTS_ATTEMPTS
      ) {
        const body = await getErrorBody(response);
        const statusText = response.statusText ? ` ${response.statusText}` : '';
        const bodySuffix = body ? `: ${body}` : '';
        throw new NonRetryableFishAudioError(
          `Fish Audio TTS failed: ${response.status}${statusText}${bodySuffix}`,
        );
      }

      const body = await getErrorBody(response);
      console.warn('[/tts] Fish Audio TTS retrying after transient error', {
        attempt,
        maxAttempts: MAX_FISH_AUDIO_TTS_ATTEMPTS,
        status: response.status,
        languageCode,
        model: config.engine,
        chunkIndex,
        totalChunks,
        body,
      });
      throw new TransientError(
        response.status,
        getRetryDelayMs(response, attempt),
      );
    }

    if (!response.body) {
      throw new Error('Fish Audio TTS response has no body stream');
    }

    const startTime = Date.now();

    const resetIdleTimeout = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        controller.abort();
      }, getIdleTimeoutMs());
    };

    resetIdleTimeout();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.byteLength;

        resetIdleTimeout();

        if (receivedBytes % 65_536 < value.byteLength) {
          console.log('[/tts] Fish Audio TTS audio chunk received', {
            languageCode,
            model: config.engine,
            chunkIndex,
            totalChunks,
            receivedBytes,
            elapsedMs: Date.now() - startTime,
          });
        }
      }
    } finally {
      if (idleTimeout) clearTimeout(idleTimeout);
      reader.releaseLock();
    }

    console.log('[/tts] Fish Audio TTS audio body read finished', {
      attempt,
      languageCode,
      model: config.engine,
      chunkIndex,
      totalChunks,
      audioBytes: receivedBytes,
      elapsedMs: Date.now() - startTime,
    });

    const result = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  } finally {
    clearTimeout(totalTimeout);
    if (idleTimeout) clearTimeout(idleTimeout);
  }
}

class TransientError extends Error {
  readonly status: number;
  readonly retryDelayMs: number;

  constructor(status: number, retryDelayMs: number) {
    super(`Transient error: ${status}`);
    this.name = 'TransientError';
    this.status = status;
    this.retryDelayMs = retryDelayMs;
  }
}

class NonRetryableFishAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableFishAudioError';
  }
}

function fetchFishAudio(
  apiKey: string,
  text: string,
  config: FishAudioTtsLanguageConfig,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(FISH_AUDIO_TTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      model: config.engine,
    },
    body: JSON.stringify({
      text,
      reference_id: config.modelId,
      format: 'mp3',
      mp3_bitrate: 128,
      chunk_length: 200,
      normalize: true,
      latency: 'normal',
    }),
    signal,
  });
}

const SENTENCE_DELIMITERS = ['。', '．', '. ', '！', '？', '…', '\n', ' '];

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const splitIndex = findBestSplitIndex(remaining, maxChars);
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function findBestSplitIndex(text: string, maxChars: number): number {
  for (const delimiter of SENTENCE_DELIMITERS) {
    const index = text.lastIndexOf(delimiter, maxChars);
    if (index > 0) {
      return index + delimiter.length;
    }
  }

  return maxChars;
}

function getRequestTimeoutMs(): number {
  const envTimeout = process.env['FISH_AUDIO_TIMEOUT_MS']?.trim();
  const timeout = envTimeout
    ? Number.parseInt(envTimeout, 10)
    : DEFAULT_REQUEST_TIMEOUT_MS;

  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function getIdleTimeoutMs(): number {
  const envTimeout = process.env['FISH_AUDIO_IDLE_TIMEOUT_MS']?.trim();
  const timeout = envTimeout
    ? Number.parseInt(envTimeout, 10)
    : DEFAULT_IDLE_TIMEOUT_MS;

  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_IDLE_TIMEOUT_MS;
}

function getMaxCharsPerRequest(): number {
  const envMax = process.env['FISH_AUDIO_MAX_CHARS_PER_REQUEST']?.trim();
  const max = envMax
    ? Number.parseInt(envMax, 10)
    : DEFAULT_MAX_CHARS_PER_REQUEST;

  return Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_CHARS_PER_REQUEST;
}

function getRequestDelayMs(): number {
  const envDelay = process.env['FISH_AUDIO_REQUEST_DELAY_MS']?.trim();
  const delay = envDelay
    ? Number.parseInt(envDelay, 10)
    : DEFAULT_REQUEST_DELAY_MS;

  return Number.isFinite(delay) && delay >= 0
    ? delay
    : DEFAULT_REQUEST_DELAY_MS;
}

function getRetryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers?.get('retry-after');
  if (retryAfter) {
    const parsedSeconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
      return parsedSeconds * 1_000;
    }
  }

  const envDelay = process.env['FISH_AUDIO_RETRY_DELAY_MS']?.trim();
  const baseDelay = envDelay
    ? Number.parseInt(envDelay, 10)
    : DEFAULT_RETRY_DELAY_MS;
  const safeBaseDelay =
    Number.isFinite(baseDelay) && baseDelay >= 0
      ? baseDelay
      : DEFAULT_RETRY_DELAY_MS;

  return safeBaseDelay * attempt;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildFishAudioCostLine(
  text: string,
  opts: TtsSynthesizeOptions,
): UsageCostLine {
  const config = getFishAudioConfig(opts);
  const utf8Bytes = Buffer.byteLength(text, 'utf8');

  return {
    category: 'tts',
    label: opts.costLabel ?? 'TTS audio',
    provider: 'fish-audio',
    model: config.engine,
    costUsd: utf8Bytes * FISH_AUDIO_PRICE_USD_PER_UTF8_BYTE,
    usage: {
      unit: 'utf8_bytes',
      quantity: utf8Bytes,
      unitPriceUsd: FISH_AUDIO_PRICE_USD_PER_UTF8_BYTE,
    },
  };
}

async function getErrorBody(response: Response): Promise<string> {
  try {
    return truncateBody(await response.text());
  } catch {
    return '';
  }
}

function truncateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= ERROR_BODY_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, ERROR_BODY_LIMIT)}...`;
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}
