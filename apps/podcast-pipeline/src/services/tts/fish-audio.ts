import type { TtsMetadata } from '../tts.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const DEFAULT_MODEL_ID = 'debb4c1065114ffda03f3a60abdcc421';
const DEFAULT_ENGINE = 's2-pro';
const DEFAULT_LANGUAGE_CODE = 'zh-Hant';
const ERROR_BODY_LIMIT = 300;

export async function synthesize(text: string): Promise<Buffer> {
  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  if (!apiKey) {
    throw new Error(
      'FISH_AUDIO_API_KEY is required when TTS_PROVIDER=fish-audio',
    );
  }

  const modelId = getModelId();
  const response = await fetch(FISH_AUDIO_TTS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      model: getEngine(),
    },
    body: JSON.stringify({
      text,
      reference_id: modelId,
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

export function getMetadata(): TtsMetadata {
  return {
    provider: 'fish-audio',
    languageCode: getLanguageCode(),
    voiceName: getModelId(),
  };
}

function getModelId(): string {
  return process.env['FISH_AUDIO_MODEL_ID']?.trim() || DEFAULT_MODEL_ID;
}

function getEngine(): string {
  return process.env['FISH_AUDIO_ENGINE']?.trim() || DEFAULT_ENGINE;
}

function getLanguageCode(): string {
  return (
    process.env['FISH_AUDIO_LANGUAGE_CODE']?.trim() || DEFAULT_LANGUAGE_CODE
  );
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
