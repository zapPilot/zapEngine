import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockTextToSpeech } = vi.hoisted(() => ({
  mockTextToSpeech: vi.fn(),
}));

vi.mock('../tts.js', () => ({
  textToSpeech: mockTextToSpeech,
}));

import { synthesizeClassroomAudio } from './classroom-audio.js';

describe('synthesizeClassroomAudio coverage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('treats a null script as empty text', async () => {
    mockTextToSpeech.mockResolvedValue({ audio: Buffer.from('x'), cost: [] });
    const result = await synthesizeClassroomAudio({
      target_language_code: 'ja',
      script: null,
    });

    expect(result.audio).toEqual(Buffer.from('x'));
    expect(mockTextToSpeech).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ languageCode: 'ja' }),
    );
  });
});
