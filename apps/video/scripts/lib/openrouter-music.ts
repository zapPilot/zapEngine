/** One billed request per call; callers own retry accounting. */
export const MUSIC_MODEL = 'google/lyria-3-pro-preview';
export const SONG_COST_USD = 0.08;

export interface MusicRequest {
  readonly apiKey: string;
  readonly prompt: string;
}

/** Audio chunks are independently base64 encoded; decode before concatenating. */
export async function generateMusic(
  request: MusicRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const response = await fetchImpl(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MUSIC_MODEL,
        messages: [{ role: 'user', content: request.prompt }],
        modalities: ['text', 'audio'],
        audio: { format: 'mp3' },
        stream: true,
      }),
      signal: AbortSignal.timeout(300_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `OpenRouter music ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  if (response.body === null) throw new Error('OpenRouter returned no stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Buffer[] = [];
  let pending = '';
  let completed = false;
  const event = (block: string) => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    if (data === '[DONE]') {
      completed = true;
      return;
    }
    const payload = JSON.parse(data) as {
      error?: { message: string };
      choices?: { delta?: { audio?: { data?: string } } }[];
    };
    if (payload.error !== undefined)
      throw new Error(`OpenRouter music stream: ${payload.error.message}`);
    for (const choice of payload.choices ?? []) {
      const encoded = choice.delta?.audio?.data;
      if (encoded !== undefined) chunks.push(Buffer.from(encoded, 'base64'));
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending = (pending + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        '\n',
      );
      let boundary: number;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        event(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
      }
      if (done) break;
    }
    if (pending.trim()) event(pending);
  } finally {
    reader.releaseLock();
  }
  if (!completed)
    throw new Error('OpenRouter music stream ended before [DONE]');
  const audio = Buffer.concat(chunks);
  if (audio.length === 0) throw new Error('OpenRouter returned no audio');
  return audio;
}
