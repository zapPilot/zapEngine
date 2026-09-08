import { describe, expect, it } from 'vitest';

import {
  buildVerticalMediaChunkFilter,
  planVerticalMediaChunks,
} from './ffmpeg-video.js';
import type { VerticalVideoManifest } from './manifest.js';

function manifestWithPresentation(input: {
  layout: 'fullBleed' | 'contain';
  motion: 'static' | 'pushIn' | 'pan';
}): VerticalVideoManifest {
  return {
    schemaVersion: 'podcast-slide-video.v4',
    rendererVersion: 'satori-resvg-v4',
    episode: {
      id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: 'Editorial motion test',
    },
    clip: {
      startMs: 0,
      durationMs: 6_800,
      width: 720,
      height: 1280,
      fps: 24,
      transitionMs: 208,
    },
    mediaWindow: { x: 0, y: 413, width: 720, height: 640 },
    headline: { kicker: 'ZAP PILOT', titleLines: ['Editorial motion test'] },
    audio: {
      sourceUrl: 'https://cdn.example.test/audio.m4a',
      narrationDurationMs: 4_000,
    },
    bgm: { trackId: 'bgm-01', gainDb: -21 },
    outro: {
      startMs: 4_000,
      title: 'From Fed to Chain',
      callToAction: '訂閱・分享・留言',
    },
    slides: [
      {
        id: 'scene-01',
        startMs: 0,
        endMs: 4_000,
        template: 'image',
        sources: [
          {
            id: 'source-01',
            label: 'Example News',
            url: 'https://news.example.test/story',
            attribution: 'Example News',
            license: 'unknown',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId: 'source-01',
          url: 'https://images.example.test/story.jpg',
          sha256: 'a'.repeat(64),
          layout: input.layout,
          position: 'center',
          motion: input.motion,
        },
      },
    ],
    captions: [{ startMs: 0, endMs: 4_000, text: '字幕' }],
  };
}

function presentationFilter(manifest: VerticalVideoManifest): string {
  const chunk = planVerticalMediaChunks(manifest)[0];
  if (!chunk) throw new Error('Vertical manifest needs a media chunk');
  return buildVerticalMediaChunkFilter(manifest, chunk);
}

describe('v8 editorial image presentation', () => {
  it('shows contain images completely and keeps static assets actually static', () => {
    const filter = presentationFilter(
      manifestWithPresentation({ layout: 'contain', motion: 'static' }),
    );

    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain(
      'pad=2880:2560:(ow-iw)/2:(oh-ih)/2:color=0x101014',
    );
    expect(filter).toContain("zoompan=z='1':x='0':y='0'");
    expect(filter).not.toContain("crop=720:640:x='");
    expect(filter).not.toContain('1.15');
    expect(filter).not.toContain('0.1800');
  });

  it('ignores fullBleed push-in metadata and uses contain plus a safe 2% drift', () => {
    const filter = presentationFilter(
      manifestWithPresentation({ layout: 'fullBleed', motion: 'pushIn' }),
    );

    expect(filter).toContain('force_original_aspect_ratio=decrease');
    expect(filter).toContain(
      'pad=2880:2560:(ow-iw)/2:(oh-ih)/2:color=0x101014',
    );
    expect(filter).toContain("zoompan=z='1':x='0':y='0'");
    // The 2% editorial drift re-crops the (unscaled) 720x640 media window.
    expect(filter).toContain('scale=706:627:flags=lanczos+accurate_rnd');
    expect(filter).toContain('pad=734:653:(ow-iw)/2:(oh-ih)/2:color=0x101014');
    expect(filter).toContain("crop=720:640:x='14*(1-");
    expect(filter).toContain('min(n/102\\,1)');
    expect(filter).not.toContain('force_original_aspect_ratio=increase');
    expect(filter).not.toContain("z='1+");
    expect(filter).not.toContain("z='1.04'");
    expect(filter).not.toContain("z='1.15'");
  });
});
