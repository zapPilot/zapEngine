import { describe, expect, it, vi } from 'vitest';

import {
  assertVideoFfmpegCapabilities,
  buildStaticSlideFfmpegArgs,
  buildStaticSlideFilter,
  kenBurnsPanForScene,
  renderStaticSlideVideo,
  resolveVideoFfmpegPath,
  runProcess,
} from './ffmpeg-video.js';
import type { SlideVideoManifest } from './manifest.js';

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
        stdout: '... xfade ... zoompan ...',
        stderr: '... ass ...',
      })
      .mockResolvedValueOnce({
        stdout: '... libx264 ...',
        stderr: '... aac ...',
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
  });

  it('reports every missing capability in one actionable error', async () => {
    const processRunner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      assertVideoFfmpegCapabilities('/bad/ffmpeg', processRunner),
    ).rejects.toThrow(
      'FFmpeg is missing: xfade filter, zoompan filter, ass filter, libx264 encoder, AAC encoder',
    );
  });

  it('checks capabilities before invoking the real render', async () => {
    const processRunner = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'xfade zoompan ass', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'libx264 aac', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });
    const options = {
      manifest: createManifest(),
      slidePaths: ['/slides/01.png', '/slides/02.png', '/slides/03.png'],
      audioSource: '/audio.m4a',
      filterScriptPath: '/filter.txt',
      outputPath: '/preview.mp4',
    };

    await renderStaticSlideVideo(options, '/opt/ffmpeg', processRunner);

    expect(processRunner).toHaveBeenCalledTimes(3);
    expect(processRunner.mock.calls[2]).toEqual([
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
