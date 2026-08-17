import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertMainNarrationAudioSource,
  buildWeightedCaptionTiming,
  detectAudioSilences,
  downloadNarrationAudio,
  parseSilenceDetection,
  probeAudioDurationMs,
  splitCaptionText,
} from './audio-analysis.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('podcast video audio analysis', () => {
  it('parses ffprobe duration and FFmpeg silence intervals', async () => {
    const probeRunner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ format: { duration: '90.001' } }),
      stderr: '',
    });
    await expect(
      probeAudioDurationMs('/audio.m4a', {
        ffprobePath: '/opt/ffprobe',
        processRunner: probeRunner,
      }),
    ).resolves.toBe(90_000);

    const silenceLog = [
      '[silencedetect] silence_start: 1.25',
      '[silencedetect] silence_end: 1.75 | silence_duration: 0.5',
    ].join('\n');
    expect(parseSilenceDetection(silenceLog)).toEqual([
      { startMs: 1_250, endMs: 1_750 },
    ]);
    const silenceRunner = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: silenceLog,
    });
    await expect(
      detectAudioSilences('/audio.m4a', {
        ffmpegPath: '/opt/ffmpeg',
        processRunner: silenceRunner,
      }),
    ).resolves.toEqual([{ startMs: 1_250, endMs: 1_750 }]);
  });

  it('resolves ffprobe from explicit env, ffmpeg sibling, and default path', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ format: { duration: 2 } }),
      stderr: '',
    });

    vi.stubEnv('VIDEO_FFPROBE_PATH', ' /custom/ffprobe ');
    await probeAudioDurationMs('/audio.m4a', { processRunner: runner });
    expect(runner.mock.calls.at(-1)?.[0]).toBe('/custom/ffprobe');

    vi.stubEnv('VIDEO_FFPROBE_PATH', '');
    vi.stubEnv('VIDEO_FFMPEG_PATH', '/opt/media/ffmpeg');
    await probeAudioDurationMs('/audio.m4a', { processRunner: runner });
    expect(runner.mock.calls.at(-1)?.[0]).toBe('/opt/media/ffprobe');

    vi.stubEnv('VIDEO_FFMPEG_PATH', '');
    await probeAudioDurationMs('/audio.m4a', { processRunner: runner });
    expect(runner.mock.calls.at(-1)?.[0]).toBe('ffprobe');
  });

  it('accepts numeric ffprobe duration and rejects malformed or non-positive values', async () => {
    await expect(
      probeAudioDurationMs('/audio.m4a', {
        processRunner: vi.fn().mockResolvedValue({
          stdout: JSON.stringify({ format: { duration: 1.25 } }),
          stderr: '',
        }),
      }),
    ).resolves.toBe(1_250);

    for (const stdout of [
      '{bad',
      '{}',
      JSON.stringify({ format: {} }),
      JSON.stringify({ format: { duration: 'nope' } }),
      JSON.stringify({ format: { duration: 0 } }),
      JSON.stringify({ format: { duration: -1 } }),
      JSON.stringify({ format: { duration: Number.POSITIVE_INFINITY } }),
    ]) {
      await expect(
        probeAudioDurationMs('/audio.m4a', {
          processRunner: vi.fn().mockResolvedValue({ stdout, stderr: '' }),
        }),
      ).rejects.toThrow(/ffprobe/u);
    }
  });

  it('parses end-only and ignores reversed or non-finite silence intervals', () => {
    expect(
      parseSilenceDetection(
        [
          'silence_end: 2.5',
          'silence_start: 4.0',
          'silence_end: 3.0',
          'silence_start: ..',
          'silence_end: ..',
        ].join('\n'),
      ),
    ).toEqual([{ startMs: 2_500, endMs: 2_500 }]);
  });

  it('uses configured ffmpeg paths for download and silence detection without explicit overrides', async () => {
    vi.stubEnv('VIDEO_FFMPEG_PATH', ' /custom/ffmpeg ');
    const downloadRunner = vi
      .fn()
      .mockResolvedValue({ stdout: '', stderr: '' });
    await downloadNarrationAudio('/local/audio.m4a', '/work/audio.m4a', {
      processRunner: downloadRunner,
    });
    expect(downloadRunner.mock.calls[0]?.[0]).toBe('/custom/ffmpeg');

    const silenceRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    await detectAudioSilences('/local/audio.m4a', {
      processRunner: silenceRunner,
    });
    expect(silenceRunner.mock.calls[0]?.[0]).toBe('/custom/ffmpeg');
  });

  it('forwards an abort signal through probe and silence detection runners', async () => {
    const controller = new AbortController();
    const probeRunner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ format: { duration: '1' } }),
      stderr: '',
    });
    await probeAudioDurationMs('/audio.m4a', {
      ffprobePath: '/probe',
      processRunner: probeRunner,
      signal: controller.signal,
    });
    expect(probeRunner.mock.calls[0]?.[3]).toBe(controller.signal);

    const silenceRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    await detectAudioSilences('/audio.m4a', {
      ffmpegPath: '/ffmpeg',
      processRunner: silenceRunner,
      signal: controller.signal,
    });
    expect(silenceRunner.mock.calls[0]?.[3]).toBe(controller.signal);
  });

  it('weights sentences, uses nearby silences, and snaps captions to 24fps', () => {
    const timing = buildWeightedCaptionTiming({
      script:
        '第一句比較短。第二句包含比較多的內容，用來測試字數權重。第三句收尾。',
      durationMs: 12_010,
      silences: [{ startMs: 2_900, endMs: 3_100 }],
    });

    expect(timing.durationMs).toBe(12_000);
    expect(timing.sentences).toHaveLength(3);
    expect(timing.sentences[0]?.endMs).toBe(3_000);
    expect(timing.captions[0]?.startMs).toBe(0);
    expect(timing.captions.at(-1)?.endMs).toBe(12_000);
    for (const caption of timing.captions) {
      const startFrame = (caption.startMs * 24) / 1_000;
      const endFrame = (caption.endMs * 24) / 1_000;
      expect(Math.abs(startFrame - Math.round(startFrame))).toBeLessThan(0.02);
      expect(Math.abs(endFrame - Math.round(endFrame))).toBeLessThan(0.02);
    }
  });

  it('keeps constrained caption chunks on exact video frames', () => {
    const timing = buildWeightedCaptionTiming({
      script: `${'甲'.repeat(100)}。第二句很長很長的內容，用來測試字幕切分是否會在不正確的影格位置結束，並且持續加入更多中文文字確保切成多段。第三句。`,
      durationMs: 550,
    });

    for (const caption of timing.captions) {
      expect(caption.endMs).toBeGreaterThan(caption.startMs);
      for (const value of [caption.startMs, caption.endMs]) {
        const nearestFrameMs = (Math.round((value * 24) / 1_000) * 1_000) / 24;
        expect(Math.abs(nearestFrameMs - value)).toBeLessThanOrEqual(0.51);
      }
    }
    expect(timing.captions.at(-1)?.endMs).toBe(timing.durationMs);
  });

  it('keeps the nearest valid silence when a later candidate is farther away', () => {
    const timing = buildWeightedCaptionTiming({
      script: 'First sentence has some words. Second sentence also has words.',
      durationMs: 4_000,
      silences: [
        { startMs: 1_850, endMs: 1_950 },
        { startMs: 900, endMs: 1_000 },
      ],
    });

    expect(timing.sentences[0]?.endMs).toBe(1_917);
  });

  it('ignores silence candidates outside legal sentence boundaries', () => {
    const timing = buildWeightedCaptionTiming({
      script: 'First sentence has some words. Second sentence also has words.',
      durationMs: 4_000,
      silences: [
        { startMs: 0, endMs: 10 },
        { startMs: 3_990, endMs: 4_000 },
      ],
    });
    expect(timing.sentences[0]?.endMs).toBeGreaterThan(10);
    expect(timing.sentences[0]?.endMs).toBeLessThan(3_990);
  });

  it('prefers punctuation as a caption break once a long chunk exceeds the budget', () => {
    const chunks = splitCaptionText(
      // eslint-disable-next-line no-secrets/no-secrets -- synthetic alphabet fixture, not a secret
      'abcdefghijklmnopqrst,uvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toBe('abcdefghijklmnopqrst,');
  });

  it('splits long captions within the two-line safe-area budget', () => {
    const chunks = splitCaptionText(
      '這是一段非常長的繁體中文字幕，必須在合理的位置切開，避免任何單一字幕超出兩行安全範圍。',
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(
      '這是一段非常長的繁體中文字幕，必須在合理的位置切開，避免任何單一字幕超出兩行安全範圍。',
    );
  });

  it('rejects an empty canonical script before timing captions', () => {
    expect(() =>
      buildWeightedCaptionTiming({ script: '   \n ', durationMs: 1_000 }),
    ).toThrow('does not contain any sentences');
  });

  it('rejects classroom and non-main remote audio sources', () => {
    expect(() =>
      assertMainNarrationAudioSource(
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
      ),
    ).toThrow('not classroom audio');
    expect(() =>
      assertMainNarrationAudioSource('https://cdn.example.com/audio.m4a'),
    ).toThrow('main HLS section');
    expect(() =>
      assertMainNarrationAudioSource('/local/audio.m4a'),
    ).not.toThrow();
  });

  it('downloads the main narration with a lossless audio remux', async () => {
    const processRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await downloadNarrationAudio(
      'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
      '/work/narration.m4a',
      { ffmpegPath: '/opt/ffmpeg', processRunner },
    );

    expect(processRunner).toHaveBeenCalledOnce();
    expect(processRunner).toHaveBeenCalledWith('/opt/ffmpeg', [
      '-y',
      '-i',
      'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
      '-map',
      '0:a:0',
      '-c',
      'copy',
      '/work/narration.m4a',
    ]);
  });

  it('forwards the abort signal through the process runner contract', async () => {
    const processRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const controller = new AbortController();

    await downloadNarrationAudio('/local/audio.m4a', '/work/narration.m4a', {
      ffmpegPath: '/opt/ffmpeg',
      processRunner,
      signal: controller.signal,
    });

    expect(processRunner).toHaveBeenCalledWith(
      '/opt/ffmpeg',
      [
        '-y',
        '-i',
        '/local/audio.m4a',
        '-map',
        '0:a:0',
        '-c',
        'copy',
        '/work/narration.m4a',
      ],
      false,
      controller.signal,
    );
  });

  it('rejects classroom narration before starting ffmpeg', async () => {
    const processRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      downloadNarrationAudio(
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
        '/work/narration.m4a',
        { processRunner },
      ),
    ).rejects.toThrow('not classroom audio');
    expect(processRunner).not.toHaveBeenCalled();
  });
});
