// A deliberately small Fish Audio client. apps/podcast-pipeline has the
// production one (chunking, streaming timeouts, cost lines); it is
// app-internal, and a pitch line is one short request.

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 120_000;

export interface FishRequest {
  readonly apiKey: string;
  readonly referenceId: string;
  readonly engine: string;
  readonly text: string;
  readonly speed: number;
}

export interface FishOptions {
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Request parameters for the storyboard’s declared official English preset. */
export function fishRequestInit(request: FishRequest): RequestInit {
  const engine = resolveEngine({ FISH_AUDIO_ENGINE: request.engine });
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${request.apiKey}`,
      'content-type': 'application/json',
      model: engine,
    },
    body: JSON.stringify({
      text: request.text,
      reference_id: request.referenceId,
      format: 'mp3',
      mp3_bitrate: 192,
      normalize: true,
      latency: 'normal',
      prosody: { speed: request.speed, volume: 0 },
    }),
  };
}

class RetryableError extends Error {}

async function attempt(
  request: FishRequest,
  fetchImpl: typeof fetch,
): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetchImpl(FISH_AUDIO_TTS_URL, {
      ...fishRequestInit(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new RetryableError(`Fish Audio request failed: ${String(cause)}`);
  }
  if (response.ok) return Buffer.from(await response.arrayBuffer());
  const body = (await response.text()).slice(0, 300);
  const message = `Fish Audio TTS ${response.status}: ${body}`;
  throw RETRYABLE.has(response.status)
    ? new RetryableError(message)
    : new Error(message);
}

/** One line of narration as MP3 bytes. Retries transient failures. */
export async function synthesize(
  request: FishRequest,
  options: FishOptions = {},
): Promise<Buffer> {
  resolveEngine({ FISH_AUDIO_ENGINE: request.engine });
  const {
    attempts = 3,
    retryDelayMs = 2_000,
    fetchImpl = fetch,
    sleep = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  } = options;
  for (let index = 1; ; index += 1) {
    try {
      return await attempt(request, fetchImpl);
    } catch (error) {
      if (!(error instanceof RetryableError) || index >= attempts) throw error;
      await sleep(retryDelayMs * index);
    }
  }
}

export const DEFAULT_ENGINE = 's2.1-pro-free';
export function resolveEngine(env: Record<string, string | undefined>): string {
  const engine = env['FISH_AUDIO_ENGINE']?.trim() || DEFAULT_ENGINE;
  if (!engine.endsWith('free'))
    throw new Error(
      `Fish Audio only allows free engines; rejected ${engine}. Use FISH_AUDIO_ENGINE=${DEFAULT_ENGINE}`,
    );
  return engine;
}
