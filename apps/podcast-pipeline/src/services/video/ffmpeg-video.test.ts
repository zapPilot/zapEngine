import { describe, expect, it, vi } from 'vitest';

import {
  assertVideoFfmpegCapabilities,
  buildStaticSlideFfmpegArgs,
  buildStaticSlideFilter,
  buildVerticalFfmpegArgs,
  buildVerticalSlideFilter,
  kenBurnsPanForScene,
  renderStaticSlideVideo,
  renderVerticalSlideVideo,
  resolveVideoFfmpegPath,
  runProcess,
} from './ffmpeg-video.js';
import type { SlideVideoManifest, VerticalVideoManifest } from './manifest.js';

const CAPABLE_FILTER_LIST =
  'xfade zoompan ass overlay pad fade apad afade amix asplit aformat sidechaincompress';

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
    schemaVersion: 'podcast-slide-video.v3',
    rendererVersion: 'satori-resvg-v4',
    episode: base.episode,
    clip: {
      startMs: 0,
      durationMs: 17_800,
      width: 1080,
      height: 1920,
      fps: 30,
      transitionMs: 200,
    },
    mediaWindow: { x: 0, y: 620, width: 1080, height: 960 },
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

describe('vertical news FFmpeg composition', () => {
  it('renders scenes at window resolution and layers frame, outro, and captions', () => {
    const filter = buildVerticalSlideFilter(
      createVerticalManifest(),
      '/render/captions.ass',
      '/render/fonts',
    );

    expect(filter).toContain('scale=1080:960:');
    expect(filter).toContain('s=1080x960');
    expect(filter).toContain(
      'xfade=transition=fade:duration=0.2:offset=3.800000[x1]',
    );
    expect(filter).toContain(
      'trim=end_frame=534,settb=expr=1/30,setpts=N,pad=1080:1920:0:620:color=0x101014[canvas]',
    );
    expect(filter).toContain('[3:v]format=rgba[frame]');
    expect(filter).toContain('[canvas][frame]overlay=0:0:format=auto[framed]');
    expect(filter).toContain(
      '[4:v]format=rgba,fade=t=in:st=15:d=0.4:alpha=1[outro]',
    );
    expect(filter).toContain(
      "[framed][outro]overlay=0:0:format=auto:enable='gte(t,15)'[branded]",
    );
    expect(filter).toContain(
      "[branded]ass=filename='/render/captions.ass':fontsdir='/render/fonts',format=yuv420p[vout]",
    );
    // The brand frame must never pass through zoompan — one zoompan per scene.
    expect(filter.match(/zoompan=/g)).toHaveLength(3);
  });

  it('pads narration through the outro tail and ducks the BGM under it', () => {
    const filter = buildVerticalSlideFilter(
      createVerticalManifest(),
      '/render/captions.ass',
      '/render/fonts',
    );

    expect(filter).toContain(
      '[5:a]aresample=sample_rate=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,apad=whole_dur=17.8,atrim=end_sample=854400,asetpts=N/SR/TB,asplit=2[nar_mix][nar_key]',
    );
    expect(filter).toContain(
      '[6:a]aresample=sample_rate=48000,aformat=channel_layouts=stereo,volume=-21dB,atrim=end_sample=854400,asetpts=N/SR/TB[bgm_lvl]',
    );
    expect(filter).toContain(
      '[bgm_lvl][nar_key]sidechaincompress=threshold=0.02:ratio=12:attack=25:release=450[bgm_duck]',
    );
    expect(filter).toContain(
      '[nar_mix][bgm_duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=out:st=16.900:d=0.9,atrim=end_sample=854400,asetpts=N/SR/TB[aout]',
    );
  });

  it('orders inputs as media, frame, outro, narration, then looping BGM', () => {
    const manifest = createVerticalManifest();
    const args = buildVerticalFfmpegArgs({
      manifest,
      mediaPaths: ['/m/01.png', '/m/02.png', '/m/03.png'],
      framePath: '/m/frame.png',
      outroPath: '/m/outro.png',
      audioSource: '/audio/narration.m4a',
      bgmPath: '/music/bgm-02.mp3',
      filterScriptPath: '/filter.txt',
      outputPath: '/output/news.mp4',
    });

    const inputPaths = args
      .map((value, index) => (args[index - 1] === '-i' ? value : null))
      .filter((value): value is string => value !== null);
    expect(inputPaths).toEqual([
      '/m/01.png',
      '/m/02.png',
      '/m/03.png',
      '/m/frame.png',
      '/m/outro.png',
      '/audio/narration.m4a',
      '/music/bgm-02.mp3',
    ]);
    const bgmInputIndex = args.indexOf('/music/bgm-02.mp3');
    expect(args.slice(bgmInputIndex - 3, bgmInputIndex)).toEqual([
      '-stream_loop',
      '-1',
      '-i',
    ]);
    expect(args).toEqual(
      expect.arrayContaining([
        '-frames:v',
        '534',
        '-t',
        '17.8',
        '-c:v',
        'libx264',
        '-movflags',
        '+faststart',
      ]),
    );
    expect(args.at(-1)).toBe('/output/news.mp4');
  });

  it('rejects a media list that does not match the manifest slides', () => {
    expect(() =>
      buildVerticalFfmpegArgs({
        manifest: createVerticalManifest(),
        mediaPaths: ['/m/01.png'],
        framePath: '/m/frame.png',
        outroPath: '/m/outro.png',
        audioSource: '/audio/narration.m4a',
        bgmPath: '/music/bgm-02.mp3',
        filterScriptPath: '/filter.txt',
        outputPath: '/output/news.mp4',
      }),
    ).toThrow('Vertical render needs 3 media inputs, received 1');
  });

  it('checks capabilities before invoking the vertical render', async () => {
    const processRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: CAPABLE_FILTER_LIST, stderr: '' })
      .mockResolvedValueOnce({ stdout: 'libx264 aac', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'normalize', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });
    const options = {
      manifest: createVerticalManifest(),
      mediaPaths: ['/m/01.png', '/m/02.png', '/m/03.png'],
      framePath: '/m/frame.png',
      outroPath: '/m/outro.png',
      audioSource: '/audio/narration.m4a',
      bgmPath: '/music/bgm-02.mp3',
      filterScriptPath: '/filter.txt',
      outputPath: '/output/news.mp4',
    };

    await renderVerticalSlideVideo(options, '/opt/ffmpeg', processRunner);

    expect(processRunner).toHaveBeenCalledTimes(4);
    expect(processRunner.mock.calls[3]).toEqual([
      '/opt/ffmpeg',
      buildVerticalFfmpegArgs(options),
      true,
    ]);
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
    expect(filter).toContain("z='1+0.05*min(on/119\\,1)'");
    expect(filter).toContain('(iw-iw/zoom)*min(on/179\\,1)');
    expect(filter).toContain('(iw-iw/zoom)*(1-min(on/149\\,1))');
    expect(filter).not.toMatch(/rotate|gblur|boxblur/i);
    expect(
      Array.from({ length: 5 }, (_, index) => kenBurnsPanForScene(index)),
    ).toEqual([
      'center',
      'leftToRight',
      'rightToLeft',
      'topToBottom',
      'center',
    ]);
  });

  it('builds 1080p H.264 High 4.1 and AAC still-image encoding args', () => {
    const args = buildStaticSlideFfmpegArgs({
      manifest: createManifest(),
      slidePaths: ['/slides/01.png', '/slides/02.png', '/slides/03.png'],
      audioSource: '/audio/narration.m4a',
      filterScriptPath: '/work/filter.txt',
      outputPath: '/output/preview.mp4',
    });

    expect(args.filter((argument) => argument === '-loop')).toHaveLength(3);
    expect(args.filter((argument) => argument === '-framerate')).toHaveLength(
      3,
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
        'slow',
        '-crf',
        '17',
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

  it('rejects with exit details and stderr from a failed process', async () => {
    await expect(
      runProcess(process.execPath, [
        '-e',
        "process.stderr.write('broken'); process.exit(7)",
      ]),
    ).rejects.toThrow(/failed \(exit 7\): broken/);
  });
});
