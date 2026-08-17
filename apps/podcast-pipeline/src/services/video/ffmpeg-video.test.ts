import { describe, expect, it, vi } from 'vitest';

import {
  assertVideoFfmpegCapabilities,
  buildStaticSlideFfmpegArgs,
  buildStaticSlideFilter,
  buildVerticalChunkedFinalFfmpegArgs,
  buildVerticalChunkedFinalFilter,
  buildVerticalMediaChunkFfmpegArgs,
  buildVerticalMediaChunkFilter,
  createFfmpegEncodeProgressReader,
  kenBurnsPanForScene,
  kenBurnsSeedForEpisode,
  parseFfmpegProgressOutTimeUs,
  planVerticalMediaChunks,
  renderStaticSlideVideo,
  renderVerticalSlideVideo,
  resolveVideoFfmpegPath,
  runProcess,
  VERTICAL_MEDIA_CHUNK_SIZE,
  type VerticalMediaChunk,
  type VerticalSlideVideoOptions,
  type VideoProcessResult,
  type VideoProcessRunner,
} from './ffmpeg-video.js';
import type { SlideVideoManifest, VerticalVideoManifest } from './manifest.js';

const CAPABLE_FILTER_LIST =
  'xfade zoompan ass overlay pad fade apad afade amix asplit aformat sidechaincompress';

function verticalRenderOptions(): VerticalSlideVideoOptions {
  return {
    manifest: createVerticalManifest(),
    mediaPaths: ['/m/01.png', '/m/02.png', '/m/03.png'],
    framePath: '/m/frame.png',
    outroPath: '/m/outro.png',
    audioSource: '/audio/narration.m4a',
    bgmPath: '/music/bgm-02.mp3',
    subtitlePath: '/render/captions.ass',
    fontsDirectory: '/render/fonts',
    outputPath: '/output/news.mp4',
  };
}

/**
 * Answers the three capability probes by inspecting the args, so one runner can
 * serve several renders without a brittle mockResolvedValueOnce chain.
 */
const capabilityAwareRunner: VideoProcessRunner = (
  _executable,
  args,
): Promise<VideoProcessResult> => {
  if (args.includes('-filters')) {
    return Promise.resolve({ stdout: CAPABLE_FILTER_LIST, stderr: '' });
  }
  if (args.includes('-encoders')) {
    return Promise.resolve({ stdout: 'libx264 aac', stderr: '' });
  }
  if (args.includes('-h')) {
    return Promise.resolve({ stdout: 'normalize', stderr: '' });
  }
  return Promise.resolve({ stdout: '', stderr: '' });
};

function createManifest(): SlideVideoManifest {
  const source = {
    id: 'image-source',
    label: 'Image source',
    url: 'https://news.example.test/story',
    attribution: 'Example News',
    license: 'unknown' as const,
    licenseUrl: null,
  };
  const slide = (index: number, startMs: number, endMs: number) => {
    const sceneId = `scene-${String(index + 1).padStart(2, '0')}`;
    return {
      id: sceneId,
      startMs,
      endMs,
      template: 'image' as const,
      sources: [source],
      asset: {
        kind: 'remoteImage' as const,
        sourceId: source.id,
        url: `https://images.example.test/${sceneId}.jpg`,
        sha256: 'a'.repeat(64),
        layout: 'fullBleed' as const,
        position: 'center' as const,
      },
    };
  };
  return {
    schemaVersion: 'podcast-slide-video.v2',
    rendererVersion: 'satori-resvg-v3',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: 'Static slide test',
    },
    clip: {
      startMs: 0,
      durationMs: 15_000,
      width: 1920,
      height: 1080,
      fps: 30,
      transitionMs: 200,
    },
    audio: { sourceUrl: 'https://cdn.example.test/audio.m4a' },
    slides: [
      slide(0, 0, 4_000),
      slide(1, 4_000, 10_000),
      slide(2, 10_000, 15_000),
    ],
    captions: [
      { startMs: 0, endMs: 4_000, text: '第一段字幕' },
      { startMs: 4_000, endMs: 10_000, text: '第二段字幕' },
      { startMs: 10_000, endMs: 15_000, text: '第三段字幕' },
    ],
  };
}

function createVerticalManifest(): VerticalVideoManifest {
  const base = createManifest();
  return {
    schemaVersion: 'podcast-slide-video.v4',
    rendererVersion: 'satori-resvg-v4',
    episode: base.episode,
    clip: {
      startMs: 0,
      durationMs: 17_800,
      width: 720,
      height: 1280,
      fps: 24,
      transitionMs: 208,
    },
    mediaWindow: { x: 0, y: 413, width: 720, height: 640 },
    headline: { kicker: '鏈上快訊', titleLines: ['世界盃最賺錢的生意'] },
    audio: {
      sourceUrl: 'https://cdn.example.test/audio.m4a',
      narrationDurationMs: 15_000,
    },
    bgm: { trackId: 'bgm-02', gainDb: -21 },
    outro: {
      startMs: 15_000,
      title: 'From Fed to Chain',
      callToAction: '訂閱・分享・留言',
    },
    slides: base.slides as VerticalVideoManifest['slides'],
    captions: base.captions,
  };
}

/**
 * A narration long enough to need three media chunks — the shape production
 * renders take and the only one where the final crossfade chain can starve.
 * Scene lengths are deliberately uneven so per-scene and per-chunk frame
 * rounding disagree somewhere.
 */
function createLongVerticalManifest(slideCount: number): VerticalVideoManifest {
  const manifest = createVerticalManifest();
  const prototype = manifest.slides[0]!;
  let startMs = 0;
  manifest.slides = Array.from({ length: slideCount }, (_value, index) => {
    const durationMs = 9_000 + (index % 5) * 700;
    const slide = {
      ...prototype,
      id: `scene-${String(index + 1).padStart(2, '0')}`,
      startMs,
      endMs: startMs + durationMs,
      asset: {
        ...prototype.asset,
        url: `https://images.example.test/scene-${index + 1}.jpg`,
      },
    };
    startMs += durationMs;
    return slide;
  });
  const narrationDurationMs = startMs;
  manifest.audio = { ...manifest.audio, narrationDurationMs };
  manifest.clip = { ...manifest.clip, durationMs: narrationDurationMs + 2_800 };
  manifest.outro = { ...manifest.outro, startMs: narrationDurationMs };
  manifest.captions = [
    { startMs: 0, endMs: narrationDurationMs, text: '字幕' },
  ];
  return manifest;
}

function longVerticalRenderOptions(
  manifest: VerticalVideoManifest,
): VerticalSlideVideoOptions {
  return {
    ...verticalRenderOptions(),
    manifest,
    mediaPaths: manifest.slides.map(
      (_slide, index) => `/m/${String(index + 1).padStart(2, '0')}.png`,
    ),
  };
}

/**
 * The scene layer of the render. A 3-slide manifest fits one chunk, so this one
 * graph carries every per-scene filter the renderer builds.
 */
function soleChunkFilter(manifest: VerticalVideoManifest): string {
  const chunk = planVerticalMediaChunks(manifest)[0];
  if (!chunk) throw new Error('Vertical manifest needs a media chunk');
  return buildVerticalMediaChunkFilter(manifest, chunk);
}

/** The presentation layer: chunk videos in, finished portrait clip out. */
function finalCompositionFilter(manifest: VerticalVideoManifest): string {
  return buildVerticalChunkedFinalFilter(
    manifest,
    planVerticalMediaChunks(manifest),
    '/render/captions.ass',
    '/render/fonts',
  );
}

/** Frames the generated chunk graph actually emits, read back from its trim. */
function chunkOutputFrames(
  manifest: VerticalVideoManifest,
  chunk: VerticalMediaChunk,
): number {
  const filter = buildVerticalMediaChunkFilter(manifest, chunk);
  const match = /trim=end_frame=(\d+)/.exec(filter);
  if (!match?.[1]) {
    throw new Error('Media chunk filter must trim to an exact frame count');
  }
  return Number(match[1]);
}

describe('vertical news FFmpeg composition', () => {
  it('renders every scene at window resolution with supersampled motion', () => {
    const filter = soleChunkFilter(createVerticalManifest());

    // Media inputs are supersampled crops; zoompan's own `s=` brings each
    // scene back down to the window, keeping motion sub-pixel smooth.
    expect(filter).toContain('scale=2880:2560:');
    expect(filter).not.toContain('scale=720:640');
    expect(filter).toContain('s=720x640');
    expect(filter).toContain(
      'xfade=transition=fade:duration=0.208:offset=3.791667[x1]',
    );
    // One zoompan per scene, and nothing else in the graph pans or zooms.
    expect(filter.match(/zoompan=/g)).toHaveLength(3);
    // Each still is decoded once. zoompan emits the scene's nominal frames,
    // transition tail, and two safety frames from that single input frame.
    expect(filter).toContain(':d=103:');
    expect(filter).toContain(':d=151:');
    expect(filter).toContain(':d=127:');
    expect(filter).not.toContain(':d=1:');
    expect(filter).not.toContain('[0:v]fps=24,scale=');
  });

  it('layers the brand frame, outro, and captions over the chunk videos', () => {
    const filter = finalCompositionFilter(createVerticalManifest());

    expect(filter).toContain(
      'tpad=stop_mode=clone:stop_duration=17.8,trim=end_frame=427,settb=expr=1/24,setpts=N,pad=720:1280:0:413:color=0x101014[canvas]',
    );
    // Chunk videos occupy the leading inputs, so the brand assets start after
    // them: one chunk here means frame 1, outro 2, narration 3, BGM 4.
    expect(filter).toContain('[1:v]format=rgba[frame]');
    expect(filter).toContain('[canvas][frame]overlay=0:0:format=auto[framed]');
    expect(filter).toContain(
      '[2:v]format=rgba,fade=t=in:st=15:d=0.4:alpha=1[outro]',
    );
    expect(filter).toContain(
      "[framed][outro]overlay=0:0:format=auto:enable='gte(t,15)'[branded]",
    );
    expect(filter).toContain(
      "[branded]ass=filename='/render/captions.ass':fontsdir='/render/fonts',format=yuv420p[vout]",
    );
    // The brand frame must never pass through zoompan; the media it sits over
    // was already animated one pass earlier.
    expect(filter).not.toContain('zoompan=');
  });

  it('pads narration through the outro tail and ducks the BGM under it', () => {
    const filter = finalCompositionFilter(createVerticalManifest());

    expect(filter).toContain(
      '[3:a]aresample=sample_rate=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,apad=whole_dur=17.8,atrim=end_sample=854400,asetpts=N/SR/TB,asplit=2[nar_mix][nar_key]',
    );
    expect(filter).toContain(
      '[4:a]aresample=sample_rate=48000,aformat=channel_layouts=stereo,volume=-21dB,atrim=end_sample=854400,asetpts=N/SR/TB[bgm_lvl]',
    );
    expect(filter).toContain(
      '[bgm_lvl][nar_key]sidechaincompress=threshold=0.02:ratio=12:attack=25:release=450[bgm_duck]',
    );
    expect(filter).toContain(
      '[nar_mix][bgm_duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=out:st=16.900:d=0.9,atrim=end_sample=854400,asetpts=N/SR/TB[aout]',
    );
  });

  it('bounds supersampled media inputs to eight scenes per chunk', () => {
    const manifest = createVerticalManifest();
    const prototype = manifest.slides[0]!;
    manifest.slides = Array.from({ length: 17 }, (_value, index) => ({
      ...prototype,
      id: `scene-${String(index + 1).padStart(2, '0')}`,
      startMs: index * 1_000,
      endMs: (index + 1) * 1_000,
      asset: {
        ...prototype.asset,
        url: `https://images.example.test/scene-${index + 1}.jpg`,
      },
    }));
    const chunks = planVerticalMediaChunks(manifest);

    expect(VERTICAL_MEDIA_CHUNK_SIZE).toBe(8);
    expect(chunks.map((chunk) => chunk.endIndex - chunk.startIndex)).toEqual([
      8, 8, 1,
    ]);
  });

  it('rejects invalid media chunk sizes and safely skips sparse slide holes', () => {
    const manifest = createVerticalManifest();
    expect(() => planVerticalMediaChunks(manifest, 0)).toThrow(
      'chunk size must be a positive integer',
    );
    expect(() => planVerticalMediaChunks(manifest, 1.5)).toThrow(
      'chunk size must be a positive integer',
    );

    const sparse = createVerticalManifest();
    sparse.slides = new Array(1) as VerticalVideoManifest['slides'];
    expect(planVerticalMediaChunks(sparse, 1)).toEqual([]);
  });

  it('fails closed on empty or mismatched vertical chunk plans', () => {
    const manifest = createVerticalManifest();
    const options = verticalRenderOptions();
    const emptyChunk: VerticalMediaChunk = {
      startIndex: 0,
      endIndex: 0,
      startMs: 0,
      endMs: 0,
      durationMs: 0,
    };

    expect(() => buildVerticalMediaChunkFilter(manifest, emptyChunk)).toThrow(
      'Vertical media chunk cannot be empty',
    );
    expect(() =>
      buildVerticalChunkedFinalFilter(
        manifest,
        [],
        '/render/captions.ass',
        '/render/fonts',
      ),
    ).toThrow('needs at least one media chunk');

    const oversizedChunk: VerticalMediaChunk = {
      startIndex: 0,
      endIndex: 4,
      startMs: 0,
      endMs: 10_000,
      durationMs: 10_000,
    };
    expect(() =>
      buildVerticalMediaChunkFfmpegArgs(
        options,
        oversizedChunk,
        '/work/chunk.mp4',
      ),
    ).toThrow('needs 4 inputs, received 3');

    const chunks = planVerticalMediaChunks(options.manifest);
    expect(() =>
      buildVerticalChunkedFinalFfmpegArgs(options, chunks, []),
    ).toThrow('planned 1 chunks but received 0 chunk files');
  });

  it('holds every media chunk past its own span, in the filter and the encoder', () => {
    const manifest = createLongVerticalManifest(20);
    const options = longVerticalRenderOptions(manifest);
    const chunks = planVerticalMediaChunks(manifest);
    const fps = manifest.clip.fps;
    const transitionFrames = Math.round(
      (manifest.clip.transitionMs * fps) / 1_000,
    );

    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      // The transition handed to the next chunk plus the two safety frames each
      // scene already carries. Trimming to the nominal span is what froze the
      // media window from the third chunk onward.
      const expectedFrames =
        Math.round((chunk.durationMs * fps) / 1_000) + transitionFrames + 2;
      const args = buildVerticalMediaChunkFfmpegArgs(
        options,
        chunk,
        '/work/chunk.mp4',
      );

      expect(chunkOutputFrames(manifest, chunk)).toBe(expectedFrames);
      expect(args[args.indexOf('-frames:v') + 1]).toBe(String(expectedFrames));
      // A `-t` left on the nominal duration would stop the encode early and
      // starve the crossfade even with the filter padded.
      expect(Number(args[args.indexOf('-t') + 1])).toBeCloseTo(
        expectedFrames / fps,
        6,
      );
    }
  });

  it('keeps every final crossfade inside the stream accumulated before it', () => {
    const manifest = createLongVerticalManifest(20);
    const chunks = planVerticalMediaChunks(manifest);
    const fps = manifest.clip.fps;
    const transitionFrames = Math.round(
      (manifest.clip.transitionMs * fps) / 1_000,
    );
    const filter = buildVerticalChunkedFinalFilter(
      manifest,
      chunks,
      '/render/captions.ass',
      '/render/fonts',
    );
    const offsets = Array.from(
      filter.matchAll(
        /xfade=transition=fade:duration=[\d.]+:offset=([\d.]+)\[cx\d+\]/g,
      ),
      (match) => Math.round(Number(match[1]) * fps),
    );

    expect(offsets).toHaveLength(chunks.length - 1);

    let accumulated = chunkOutputFrames(manifest, chunks[0]!);
    offsets.forEach((offset, index) => {
      const chunk = chunks[index + 1]!;
      // xfade reads its A side through offset+duration, and each xfade shortens
      // the accumulated stream by one transition. Falling short here is exactly
      // the freeze: ffmpeg drops this chunk and every chunk after it.
      expect(offset + transitionFrames).toBeLessThanOrEqual(accumulated);
      // Offsets stay on the absolute timeline. Captions, narration and BGM are
      // mixed against it, so a cumulative offset would drift the media instead.
      expect(offset).toBe(
        Math.round((chunk.startMs * fps) / 1_000) - transitionFrames,
      );
      accumulated = offset + chunkOutputFrames(manifest, chunk);
    });
    // The composed media still outlasts the clip, so the presentation pass trims
    // rather than clone-padding its way to the end.
    expect(accumulated).toBeGreaterThanOrEqual(
      Math.round((manifest.audio.narrationDurationMs * fps) / 1_000),
    );
  });

  it('feeds only chunk videos into the final portrait composition', () => {
    const options = verticalRenderOptions();
    const chunks = planVerticalMediaChunks(options.manifest);
    const chunkPaths = ['/work/media-chunk-01.mp4'];
    const args = buildVerticalChunkedFinalFfmpegArgs(
      options,
      chunks,
      chunkPaths,
    );
    const inputPaths = args
      .map((value, index) => (args[index - 1] === '-i' ? value : null))
      .filter((value): value is string => value !== null);

    expect(inputPaths).toEqual([
      '/work/media-chunk-01.mp4',
      '/m/frame.png',
      '/m/outro.png',
      '/audio/narration.m4a',
      '/music/bgm-02.mp3',
    ]);
    expect(inputPaths).not.toContain('/m/01.png');
    expect(args.filter((argument) => argument === '-loop')).toHaveLength(1);
    expect(args.filter((argument) => argument === '-framerate')).toHaveLength(
      1,
    );
    expect(
      args.slice(
        args.indexOf(options.framePath) - 1,
        args.indexOf(options.framePath) + 1,
      ),
    ).toEqual(['-i', options.framePath]);
    expect(
      args.slice(
        args.indexOf(options.outroPath) - 5,
        args.indexOf(options.outroPath) + 1,
      ),
    ).toEqual([
      '-loop',
      '1',
      '-framerate',
      String(options.manifest.clip.fps),
      '-i',
      options.outroPath,
    ]);
    expect(args.at(-1)).toBe('/output/news.mp4');
  });

  it('uses plain still inputs for every media chunk scene', () => {
    const options = verticalRenderOptions();
    const chunk = planVerticalMediaChunks(options.manifest)[0];
    if (!chunk) throw new Error('Vertical manifest needs a media chunk');

    const args = buildVerticalMediaChunkFfmpegArgs(
      options,
      chunk,
      '/work/chunk.mp4',
    );

    expect(args.filter((argument) => argument === '-loop')).toHaveLength(0);
    expect(args.filter((argument) => argument === '-framerate')).toHaveLength(
      0,
    );
    expect(
      args
        .map((value, index) => (args[index - 1] === '-i' ? value : null))
        .filter((value): value is string => value !== null),
    ).toEqual(options.mediaPaths);
  });

  it('renders one bounded media pass plus one final pass after capability checks', async () => {
    const processRunner = vi.fn(capabilityAwareRunner);
    const options = verticalRenderOptions();
    const chunks = planVerticalMediaChunks(options.manifest);
    const chunkPath = '/output/news.mp4.media-chunk-01.mp4';

    await renderVerticalSlideVideo(options, '/opt/ffmpeg', processRunner);

    expect(processRunner).toHaveBeenCalledTimes(5);
    expect(processRunner.mock.calls[3]).toEqual([
      '/opt/ffmpeg',
      buildVerticalMediaChunkFfmpegArgs(options, chunks[0]!, chunkPath),
      true,
    ]);
    expect(processRunner.mock.calls[4]).toEqual([
      '/opt/ffmpeg',
      buildVerticalChunkedFinalFfmpegArgs(options, chunks, [chunkPath]),
      true,
    ]);
  });

  it('rejects a media list that does not match the manifest slides', async () => {
    const options = verticalRenderOptions();
    await expect(
      renderVerticalSlideVideo(
        { ...options, mediaPaths: ['/m/01.png'] },
        '/opt/ffmpeg',
        vi.fn(capabilityAwareRunner),
      ),
    ).rejects.toThrow('Vertical render needs 3 media inputs, received 1');
  });

  it('forwards a render abort signal even when progress callbacks are disabled', async () => {
    const processRunner = vi.fn(capabilityAwareRunner);
    const controller = new AbortController();

    await renderVerticalSlideVideo(
      { ...verticalRenderOptions(), signal: controller.signal },
      '/opt/ffmpeg',
      processRunner,
    );

    expect(processRunner.mock.calls[3]?.[3]).toBe(controller.signal);
    expect(processRunner.mock.calls[4]?.[3]).toBe(controller.signal);
  });

  it('returns separate wall times for chunk and final encoding', async () => {
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_375)
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(2_125);
    try {
      await expect(
        renderVerticalSlideVideo(
          verticalRenderOptions(),
          '/opt/ffmpeg',
          vi.fn(capabilityAwareRunner),
        ),
      ).resolves.toEqual({ chunkEncodeMs: 375, finalEncodeMs: 125 });
    } finally {
      now.mockRestore();
    }
  });

  it('asks ffmpeg for machine-readable progress on every render pass', () => {
    const options = verticalRenderOptions();
    const chunks = planVerticalMediaChunks(options.manifest);
    const verticalArgs = [
      buildVerticalMediaChunkFfmpegArgs(options, chunks[0]!, '/work/chunk.mp4'),
      buildVerticalChunkedFinalFfmpegArgs(options, chunks, ['/work/chunk.mp4']),
    ];
    const staticArgs = buildStaticSlideFfmpegArgs({
      manifest: createManifest(),
      slidePaths: ['/slides/slide-01.png'],
      audioSource: 'https://cdn.example.test/audio.m3u8',
      filterScriptPath: '/filter.txt',
      outputPath: '/output/slides.mp4',
    });

    for (const args of [...verticalArgs, staticArgs]) {
      expect(args).toContain('-progress');
      expect(args[args.indexOf('-progress') + 1]).toBe('pipe:1');
      expect(args).toContain('-stats');
    }
  });

  it('forwards stdout readers to both chunk and final passes only when progress is wanted', async () => {
    const processRunner = vi.fn(capabilityAwareRunner);
    const options = verticalRenderOptions();

    await renderVerticalSlideVideo(options, '/opt/ffmpeg', processRunner);
    expect(processRunner.mock.calls[3]).toHaveLength(3);
    expect(processRunner.mock.calls[4]).toHaveLength(3);

    processRunner.mockClear();
    await renderVerticalSlideVideo(
      { ...options, onEncodeProgress: vi.fn() },
      '/opt/ffmpeg',
      processRunner,
    );
    expect(processRunner.mock.calls[3]).toHaveLength(5);
    expect(processRunner.mock.calls[4]).toHaveLength(5);
  });

  it('reports monotonic aggregate progress across chunk and final passes', async () => {
    const onEncodeProgress = vi.fn();
    const processRunner = vi.fn<VideoProcessRunner>(
      (executable, args, _streamStdio, _signal, onStdoutLine) => {
        onStdoutLine?.('out_time_us=8900000');
        onStdoutLine?.('progress=end');
        return capabilityAwareRunner(executable, args);
      },
    );

    await renderVerticalSlideVideo(
      { ...verticalRenderOptions(), onEncodeProgress },
      '/opt/ffmpeg',
      processRunner,
    );

    const fractions = onEncodeProgress.mock.calls.map(([fraction]) => fraction);
    expect(fractions).toHaveLength(4);
    expect(fractions[0]).toBeCloseTo(0.445);
    expect(fractions.slice(1)).toEqual([0.75, 0.875, 1]);
  });
});

describe('Ken Burns motion', () => {
  it('derives a stable per-episode seed inside the motion rotation', () => {
    const episodeId = '9ee737b4-c3d3-4f88-9837-ccc7fc20704e';
    expect(kenBurnsSeedForEpisode(episodeId)).toBe(3);
    expect(kenBurnsSeedForEpisode(episodeId)).toBe(
      kenBurnsSeedForEpisode(episodeId),
    );
    for (const other of ['episode-a', 'episode-b', 'episode-c']) {
      const seed = kenBurnsSeedForEpisode(other);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(5);
    }
  });

  it('falls back to an eased zoom when a pinned crop lands on the vertical pan', () => {
    const manifest = createVerticalManifest();
    // Seed 3 puts the rightToLeft pan on scene 0 and topToBottom on scene 1.
    const [first, second] = manifest.slides;
    if (!first || !second) throw new Error('Vertical manifest needs 3 slides');
    first.asset.position = 'bottom';
    second.asset.position = 'top';

    const filter = soleChunkFilter(manifest);

    // Scene 0 pans horizontally with its bottom edge pinned.
    expect(filter).toContain(
      "x='(iw-iw/zoom)*(1-pow(min(on/95\\,1)\\,2)*(3-2*min(on/95\\,1)))':y='ih-ih/zoom'",
    );
    // Scene 1 cannot pan vertically while pinned to the top, so it zooms in.
    expect(filter).toContain(
      "z='1+0.0840*pow(min(on/143\\,1)\\,2)*(3-2*min(on/143\\,1))':x='(iw-iw/zoom)/2':y='0'",
    );
  });

  it('caps the zoom travel on long scenes', () => {
    const manifest = createVerticalManifest();
    const lastSlide = manifest.slides[2];
    if (!lastSlide) throw new Error('Vertical manifest needs 3 slides');
    // A 20s scene at 0.014/s would reach 0.28 without the cap.
    lastSlide.endMs = 30_000;

    const filter = soleChunkFilter(manifest);

    expect(filter).toContain("z='1+0.1800*");
  });
});

describe('ffmpeg encode progress', () => {
  it('reads out_time_ms as microseconds, matching ffmpeg despite the key name', () => {
    // A long-standing ffmpeg misnomer: out_time_ms carries microseconds. Reading
    // it as milliseconds would peg any encode near 0% for its whole run.
    expect(parseFfmpegProgressOutTimeUs('out_time_ms=41200000')).toBe(
      41_200_000,
    );
    expect(parseFfmpegProgressOutTimeUs('out_time_us=41200000')).toBe(
      41_200_000,
    );
  });

  it('ignores placeholder, negative, and unrelated progress lines', () => {
    expect(parseFfmpegProgressOutTimeUs('out_time_us=N/A')).toBeNull();
    expect(parseFfmpegProgressOutTimeUs('out_time_us=-1')).toBeNull();
    expect(parseFfmpegProgressOutTimeUs('frame=201')).toBeNull();
    expect(parseFfmpegProgressOutTimeUs('out_time=00:00:41.200000')).toBeNull();
    expect(parseFfmpegProgressOutTimeUs('')).toBeNull();
  });

  it('reports a monotonic fraction of the clip duration', () => {
    const fractions: number[] = [];
    const read = createFfmpegEncodeProgressReader(100_000, (fraction) =>
      fractions.push(fraction),
    );

    read('out_time_us=25000000');
    read('out_time_us=50000000');
    // A repeated or stale sample must not emit, so the bar cannot stutter.
    read('out_time_us=40000000');
    read('out_time_us=50000000');
    read('out_time_us=999000000');

    expect(fractions).toEqual([0.25, 0.5, 1]);
  });

  it('treats ffmpeg’s own end marker as complete', () => {
    const fractions: number[] = [];
    const read = createFfmpegEncodeProgressReader(100_000, (fraction) =>
      fractions.push(fraction),
    );

    read('out_time_us=25000000');
    read('progress=end');

    expect(fractions).toEqual([0.25, 1]);
  });

  it('does not double-report completion for a fast encode', () => {
    // Real ffmpeg emits a progress block only every stats period, so an encode
    // that outruns it lands its final out_time sample on the last frame and then
    // sends progress=end. Both must not report 100%.
    const fractions: number[] = [];
    const read = createFfmpegEncodeProgressReader(6_000, (fraction) =>
      fractions.push(fraction),
    );

    read('out_time_us=6000000');
    read('progress=end');

    expect(fractions).toEqual([1]);
  });

  it('does not report completion when ffmpeg ends while aborting', () => {
    const fractions: number[] = [];
    const controller = new AbortController();
    const read = createFfmpegEncodeProgressReader(
      100_000,
      (fraction) => fractions.push(fraction),
      controller.signal,
    );

    read('out_time_us=25000000');
    controller.abort();
    read('progress=end');

    expect(fractions).toEqual([0.25]);
  });

  it('stays silent when the clip duration is unusable', () => {
    const onFraction = vi.fn();
    const read = createFfmpegEncodeProgressReader(0, onFraction);

    read('out_time_us=25000000');

    expect(onFraction).not.toHaveBeenCalled();
  });
});

describe('static slide FFmpeg composition', () => {
  it('builds frame-exact crossfades with gentle deterministic camera motion', () => {
    const filter = buildStaticSlideFilter(
      createManifest(),
      "/render:one/captions'final.ass",
      '/render/fonts',
    );

    expect(filter).toContain(
      'xfade=transition=fade:duration=0.2:offset=3.800000[x1]',
    );
    expect(filter).toContain(
      'xfade=transition=fade:duration=0.2:offset=9.800000[x2]',
    );
    expect(filter).toContain('trim=end_frame=450');
    expect(filter).toContain('atrim=end_sample=720000');
    expect(filter).toContain("filename='/render\\:one/captions\\'final.ass'");
    expect(filter).toContain("fontsdir='/render/fonts'");
    expect(filter.match(/xfade=/g)).toHaveLength(2);
    expect(filter.match(/zoompan=/g)).toHaveLength(3);
    // Legacy landscape rasters already arrive at output size — no supersampling.
    expect(filter).toContain('scale=1920:1080:');
    // The test episode id seeds the rotation at 3, so the three scenes run
    // rightToLeft, topToBottom, then zoomIn.
    expect(filter).toContain(
      "z='1.15':x='(iw-iw/zoom)*(1-pow(min(on/119\\,1)\\,2)*(3-2*min(on/119\\,1)))'",
    );
    expect(filter).toContain(
      "y='(ih-ih/zoom)*pow(min(on/179\\,1)\\,2)*(3-2*min(on/179\\,1))'",
    );
    expect(filter).toContain(
      "z='1+0.0700*pow(min(on/149\\,1)\\,2)*(3-2*min(on/149\\,1))'",
    );
    // Pans hold a constant zoom; only zoom scenes carry an eased z expression.
    expect(filter.match(/z='1\.15'/g)).toHaveLength(2);
    expect(filter).not.toMatch(/rotate|gblur|boxblur/i);
    expect(
      Array.from({ length: 6 }, (_, index) => kenBurnsPanForScene(index)),
    ).toEqual([
      'zoomIn',
      'leftToRight',
      'zoomOut',
      'rightToLeft',
      'topToBottom',
      'zoomIn',
    ]);
    expect(kenBurnsPanForScene(0, 3)).toBe('rightToLeft');
  });

  it('builds 1080p H.264 High 4.1 and AAC still-image encoding args', () => {
    const args = buildStaticSlideFfmpegArgs({
      manifest: createManifest(),
      slidePaths: ['/slides/01.png', '/slides/02.png', '/slides/03.png'],
      audioSource: '/audio/narration.m4a',
      filterScriptPath: '/work/filter.txt',
      outputPath: '/output/preview.mp4',
    });

    expect(args.filter((argument) => argument === '-loop')).toHaveLength(0);
    expect(args.filter((argument) => argument === '-framerate')).toHaveLength(
      0,
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '-filter_complex_script',
        '/work/filter.txt',
        '-frames:v',
        '450',
        '-t',
        '15',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-tune',
        'stillimage',
        '-profile:v',
        'high',
        '-level:v',
        '4.1',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '60',
        '-colorspace',
        'bt709',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
      ]),
    );
    expect(args.at(-1)).toBe('/output/preview.mp4');
    expect(args.indexOf('/audio/narration.m4a')).toBeGreaterThan(
      args.indexOf('/slides/03.png'),
    );
  });

  it('accepts all required FFmpeg capabilities from stdout or stderr', async () => {
    const processRunner = vi
      .fn()
      .mockResolvedValueOnce({
        stdout:
          '... xfade ... zoompan ... overlay ... pad ... fade ... apad ... afade ... amix ... asplit ... aformat ...',
        stderr: '... ass ... sidechaincompress ...',
      })
      .mockResolvedValueOnce({
        stdout: '... libx264 ...',
        stderr: '... aac ...',
      })
      .mockResolvedValueOnce({
        stdout: 'amix AVOptions:\n  normalize  <boolean> ...',
        stderr: '',
      });

    await expect(
      assertVideoFfmpegCapabilities('/opt/ffmpeg', processRunner),
    ).resolves.toBeUndefined();
    expect(processRunner).toHaveBeenNthCalledWith(1, '/opt/ffmpeg', [
      '-hide_banner',
      '-filters',
    ]);
    expect(processRunner).toHaveBeenNthCalledWith(2, '/opt/ffmpeg', [
      '-hide_banner',
      '-encoders',
    ]);
    expect(processRunner).toHaveBeenNthCalledWith(3, '/opt/ffmpeg', [
      '-hide_banner',
      '-h',
      'filter=amix',
    ]);
  });

  it('reports every missing capability in one actionable error', async () => {
    const processRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      assertVideoFfmpegCapabilities('/bad/ffmpeg', processRunner),
    ).rejects.toThrow(
      'FFmpeg is missing: xfade filter, zoompan filter, ass filter, overlay filter, pad filter, fade filter, apad filter, afade filter, amix filter, asplit filter, aformat filter, sidechaincompress filter, libx264 encoder, AAC encoder, amix normalize option (ffmpeg >= 4.4)',
    );
  });

  it('rejects an old binary whose amix lacks the normalize option', async () => {
    const processRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: CAPABLE_FILTER_LIST, stderr: '' })
      .mockResolvedValueOnce({ stdout: 'libx264 aac', stderr: '' })
      .mockResolvedValueOnce({
        stdout: 'amix AVOptions:\n  duration  <int> ...',
        stderr: '',
      });

    await expect(
      assertVideoFfmpegCapabilities('/old/ffmpeg', processRunner),
    ).rejects.toThrow(
      'FFmpeg is missing: amix normalize option (ffmpeg >= 4.4)',
    );
  });

  it('checks capabilities before invoking the real render', async () => {
    const processRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: CAPABLE_FILTER_LIST, stderr: '' })
      .mockResolvedValueOnce({ stdout: 'libx264 aac', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'normalize', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });
    const options = {
      manifest: createManifest(),
      slidePaths: ['/slides/01.png', '/slides/02.png', '/slides/03.png'],
      audioSource: '/audio.m4a',
      filterScriptPath: '/filter.txt',
      outputPath: '/preview.mp4',
    };

    await renderStaticSlideVideo(options, '/opt/ffmpeg', processRunner);

    expect(processRunner).toHaveBeenCalledTimes(4);
    expect(processRunner.mock.calls[3]).toEqual([
      '/opt/ffmpeg',
      buildStaticSlideFfmpegArgs(options),
      true,
    ]);
  });
});

describe('FFmpeg process utilities', () => {
  it('falls back to the bundled FFmpeg path when the env override is blank', () => {
    const original = process.env['VIDEO_FFMPEG_PATH'];
    process.env['VIDEO_FFMPEG_PATH'] = '   ';
    try {
      expect(resolveVideoFfmpegPath()).toEqual(expect.any(String));
      expect(resolveVideoFfmpegPath()).not.toBe('');
    } finally {
      if (original === undefined) delete process.env['VIDEO_FFMPEG_PATH'];
      else process.env['VIDEO_FFMPEG_PATH'] = original;
    }
  });

  it('honors a trimmed VIDEO_FFMPEG_PATH override', () => {
    const original = process.env['VIDEO_FFMPEG_PATH'];
    process.env['VIDEO_FFMPEG_PATH'] = '  /custom/ffmpeg  ';
    try {
      expect(resolveVideoFfmpegPath()).toBe('/custom/ffmpeg');
    } finally {
      if (original === undefined) delete process.env['VIDEO_FFMPEG_PATH'];
      else process.env['VIDEO_FFMPEG_PATH'] = original;
    }
  });

  it('captures stdout and stderr from a successful process', async () => {
    await expect(
      runProcess(process.execPath, [
        '-e',
        "process.stdout.write('out'); process.stderr.write('err')",
      ]),
    ).resolves.toEqual({ stdout: 'out', stderr: 'err' });
  });

  it('streams bounded output and emits complete stdout progress lines', async () => {
    const lines: string[] = [];
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const result = await runProcess(
        process.execPath,
        [
          '-e',
          [
            "process.stdout.write('out_time_us=1000\\npartial');",
            "setTimeout(() => process.stdout.write('_line\\nout_time_us=2000\\n'), 5);",
            "process.stderr.write('rendering\\n');",
          ].join(' '),
        ],
        true,
        undefined,
        (line) => lines.push(line),
      );

      expect(lines).toEqual([
        'out_time_us=1000',
        'partial_line',
        'out_time_us=2000',
      ]);
      expect(result.stdout).toContain('partial_line');
      expect(result.stderr).toContain('rendering');
      expect(stderrWrite).toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });

  it('bounds retained streamed output to the diagnostic tail', async () => {
    const result = await runProcess(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(12000));"],
      true,
    );
    expect(result.stdout).toHaveLength(8_000);
  });

  it('terminates a running child when the abort signal fires', async () => {
    const controller = new AbortController();
    const promise = runProcess(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      false,
      controller.signal,
    );
    setTimeout(() => controller.abort(new Error('render lease lost')), 20);
    await expect(promise).rejects.toThrow('render lease lost');
  });

  it('detects an already-aborted signal before spawning', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    await expect(
      runProcess(
        process.execPath,
        ['-e', 'process.exit(0)'],
        false,
        controller.signal,
      ),
    ).rejects.toThrow('already cancelled');
  });

  it('reports SIGKILL as likely out of memory', async () => {
    await expect(
      runProcess(process.execPath, [
        '-e',
        "process.stderr.write('memory pressure'); process.kill(process.pid, 'SIGKILL')",
      ]),
    ).rejects.toThrow(/signal SIGKILL, likely out of memory.*memory pressure/u);
  });

  it('uses the last non-blank stderr line as the headline while retaining the full tail', async () => {
    await expect(
      runProcess(process.execPath, [
        '-e',
        "process.stderr.write('first\\rprogress\\r\\nlast\\n'); process.exit(7)",
      ]),
    ).rejects.toThrow(/failed \(exit 7\): last\nfirst\rprogress\r\nlast/u);
  });

  it('reports an exit failure even when the process writes no diagnostics', async () => {
    await expect(
      runProcess(process.execPath, ['-e', 'process.exit(7)']),
    ).rejects.toThrow(/failed \(exit 7\)$/u);
  });

  it('rejects with exit details and stderr from a failed process', async () => {
    await expect(
      runProcess(process.execPath, [
        '-e',
        "process.stderr.write('broken'); process.exit(7)",
      ]),
    ).rejects.toThrow(/failed \(exit 7\): broken/);
  });
});
