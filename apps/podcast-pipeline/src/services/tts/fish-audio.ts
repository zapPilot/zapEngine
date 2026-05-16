import type { UsageCostLine } from '../cost.js';
import type {
  TtsMetadata,
  TtsSynthesisResult,
  TtsSynthesizeOptions,
} from '../tts.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const FISH_AUDIO_PRICE_USD_PER_MILLION_UTF8_BYTES = 15;
const FISH_AUDIO_PRICE_USD_PER_UTF8_BYTE =
  FISH_AUDIO_PRICE_USD_PER_MILLION_UTF8_BYTES / 1_000_000;
const ERROR_BODY_LIMIT = 300;

export async function synthesize(
  text: string,
  opts: TtsSynthesizeOptions,
): Promise<TtsSynthesisResult> {
  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error('FISH_AUDIO_API_KEY is required for Fish Audio TTS');
  }

  const config = getFishAudioConfig(opts);
  const response = await fetch(FISH_AUDIO_TTS_URL, {
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
  });

  if (!response.ok) {
    const body = await getErrorBody(response);
    const statusText = response.statusText ? ` ${response.statusText}` : '';
    const bodySuffix = body ? `: ${body}` : '';
    throw new Error(
      `Fish Audio TTS failed: ${response.status}${statusText}${bodySuffix}`,
    );
  }

  return {
    audio: Buffer.from(await response.arrayBuffer()),
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

function getFishAudioConfig(opts: TtsSynthesizeOptions) {
  if (opts.config.provider !== 'fish-audio') {
    throw new Error(
      `Fish Audio TTS received ${opts.config.provider} language config`,
    );
  }

  return opts.config;
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
