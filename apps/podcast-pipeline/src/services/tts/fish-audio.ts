import type { TtsMetadata, TtsSynthesizeOptions } from '../tts.js';
import { FISH_AUDIO_MODELS } from './fish-audio-models.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const ERROR_BODY_LIMIT = 300;

export async function synthesize(
  text: string,
  opts: TtsSynthesizeOptions,
): Promise<Buffer> {
  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error(
      'FISH_AUDIO_API_KEY is required when TTS_PROVIDER=fish-audio',
    );
  }

  const model = FISH_AUDIO_MODELS[opts.languageCode];
  const response = await fetch(FISH_AUDIO_TTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      model: model.engine,
    },
    body: JSON.stringify({
      text,
      reference_id: model.modelId,
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

  return Buffer.from(await response.arrayBuffer());
}

export function getMetadata(opts: TtsSynthesizeOptions): TtsMetadata {
  const model = FISH_AUDIO_MODELS[opts.languageCode];
  return {
    provider: 'fish-audio',
    languageCode: opts.languageCode,
    voiceName: model.modelId,
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
