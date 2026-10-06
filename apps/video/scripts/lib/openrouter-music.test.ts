import { describe, expect, it, vi } from 'vitest';

import { generateMusic, MUSIC_MODEL } from './openrouter-music';

const request = { apiKey: 'test-key', prompt: 'instrumental' };
function stream(text: string, split = 7): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += split) {
          controller.enqueue(bytes.slice(i, i + split));
        }
        controller.close();
      },
    }),
  );
}
describe('OpenRouter music streaming', () => {
  it('requests MP3 without a speech voice and decodes each base64 chunk independently', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        stream(
          ': keepalive\r\n\r\ndata: {"choices":[{"delta":{"audio":{"data":"YQ=="}}},{"delta":{"audio":{"data":"YmM="}}}]}\r\n\r\ndata: {}\n\ndata: {"choices":[{}, {"delta":{}}]}\n\ndata: [DONE]',
        ),
      );
    expect(await generateMusic(request, fetchImpl)).toEqual(Buffer.from('abc'));
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: MUSIC_MODEL,
      modalities: ['text', 'audio'],
      audio: { format: 'mp3' },
      stream: true,
    });
    expect(init?.headers).toMatchObject({ authorization: 'Bearer test-key' });
  });
  it('rejects HTTP failures with useful provider details', async () => {
    await expect(
      generateMusic(
        request,
        vi.fn().mockResolvedValue(new Response('no credits', { status: 402 })),
      ),
    ).rejects.toThrow('402: no credits');
  });
  it('rejects missing streams', async () => {
    await expect(
      generateMusic(request, vi.fn().mockResolvedValue(new Response(null))),
    ).rejects.toThrow('no stream');
  });
  it('rejects in-stream errors and malformed events', async () => {
    await expect(
      generateMusic(
        request,
        vi
          .fn()
          .mockResolvedValue(
            stream('data: {"error":{"message":"unavailable"}}\n\n'),
          ),
      ),
    ).rejects.toThrow('unavailable');
    await expect(
      generateMusic(
        request,
        vi.fn().mockResolvedValue(stream('data: broken\n\n')),
      ),
    ).rejects.toThrow();
  });
  it('rejects truncated and empty audio responses', async () => {
    await expect(
      generateMusic(request, vi.fn().mockResolvedValue(stream('data: {}\n\n'))),
    ).rejects.toThrow('before [DONE]');
    await expect(
      generateMusic(
        request,
        vi.fn().mockResolvedValue(stream('data: [DONE]\n\n')),
      ),
    ).rejects.toThrow('no audio');
  });
  it('propagates transport failure', async () => {
    await expect(
      generateMusic(request, vi.fn().mockRejectedValue(new Error('offline'))),
    ).rejects.toThrow('offline');
  });
});

it('uses global fetch by default', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        stream(
          'data: {"choices":[{"delta":{"audio":{"data":"YQ=="}}}]}\n\ndata: [DONE]\n\n',
        ),
      ),
  );
  try {
    expect(await generateMusic(request)).toEqual(Buffer.from('a'));
  } finally {
    vi.unstubAllGlobals();
  }
});
