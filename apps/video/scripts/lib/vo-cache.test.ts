import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { VoManifest } from '../../src/timeline/manifest';
import type { Storyboard } from '../../src/timeline/types';
import { BRAND_CLIPS } from './speech-plan';
import {
  clipFileName,
  droppedLines,
  fileDigest,
  lineFingerprint,
  missingClips,
  orphanFiles,
  requireNarration,
  staleLines,
  voiceKey,
} from './vo-cache';

const voice = { speed: 1, voice: 'hannah' as const };

const storyboard: Storyboard = {
  id: 'v',
  fps: 30,
  width: 1920,
  height: 1080,
  maxSeconds: 60,
  transitionFrames: 12,
  leadIn: 12,
  tail: 12,
  gap: 6,
  voice,
  music: { src: 'music/test.mp3', prompt: 'Instrumental' },
  scenes: [
    {
      id: 's',
      props: {},
      vo: [
        { id: 'a', text: 'Hello.' },
        { id: 'b', text: 'CREATE2.', say: 'create two.' },
      ],
    },
  ],
};

const clip = (fingerprint: string, file = `vo/v/${fingerprint}.mp3`) => ({
  file,
  fingerprint,
  durationSeconds: 1,
});

describe('lineFingerprint', () => {
  it('hashes what is said, not what is shown', () => {
    expect(lineFingerprint({ id: 'x', text: 'A', say: 'B' }, voice)).toBe(
      lineFingerprint({ id: 'y', text: 'B' }, voice),
    );
    expect(lineFingerprint({ id: 'x', text: 'A' }, voice)).toMatch(
      /^[0-9a-f]{16}$/,
    );
  });

  it('changes with the voice settings', () => {
    const line = { id: 'x', text: 'A' };
    expect(lineFingerprint(line, { speed: 1, voice: 'adrian' })).not.toBe(
      lineFingerprint(line, voice),
    );
    expect(lineFingerprint(line, { speed: 1.1, voice: 'hannah' })).not.toBe(
      lineFingerprint(line, voice),
    );
  });
});

describe('voiceKey and clipFileName', () => {
  it('derive short, stable names without exposing the reference id', () => {
    const key = voiceKey('s2-pro', 'secret-reference');
    expect(key).toMatch(/^[0-9a-f]{12}$/);
    expect(key).not.toContain('secret');
    expect(voiceKey('s1', 'secret-reference')).not.toBe(key);
    expect(clipFileName('abc', key)).toMatch(/^[0-9a-f]{16}\.mp3$/);
    expect(clipFileName('abc', key)).not.toBe(clipFileName('abc', 'other'));
  });
});

describe('manifest freshness', () => {
  const fresh: VoManifest = {
    videoId: 'v',
    engine: 'e',
    voiceKey: 'k',
    lines: {
      a: clip(lineFingerprint({ id: 'a', text: 'Hello.' }, voice)),
      b: clip(
        lineFingerprint(
          { id: 'b', text: 'CREATE2.', say: 'create two.' },
          voice,
        ),
      ),
      gone: clip('old'),
    },
  };

  it('flags lines whose words or settings changed, or that are missing', () => {
    expect(staleLines(storyboard, fresh)).toEqual([]);
    expect(
      staleLines(storyboard, { ...fresh, lines: { a: clip('old') } }),
    ).toEqual(['a', 'b']);
  });

  it('lists entries the storyboard no longer has', () => {
    expect(droppedLines(storyboard, fresh)).toEqual(['gone']);
  });

  it('finds unreferenced mp3 files in the voice folder', () => {
    expect(
      orphanFiles(['old.mp3', 'stray.mp3', 'notes.txt'], fresh, 'vo/v'),
    ).toEqual(['stray.mp3']);
  });
});

describe('missing generated clips', () => {
  it('detects missing disk files even when fingerprints are current', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vo-cache-test-'));
    const manifest: VoManifest = {
      videoId: 'v',
      engine: 'e',
      voiceKey: 'k',
      lines: {
        a: clip(
          lineFingerprint(storyboard.scenes[0]!.vo[0]!, voice),
          'vo/v/a.mp3',
        ),
        b: clip(
          lineFingerprint(storyboard.scenes[0]!.vo[1]!, voice),
          'vo/v/b.mp3',
        ),
      },
    };
    try {
      expect(staleLines(storyboard, manifest)).toEqual([]);
      expect(missingClips(manifest, root)).toEqual(['a', 'b']);
      expect(() => requireNarration(storyboard, manifest, root)).toThrow(
        'run pnpm voiceover v first',
      );
      mkdirSync(path.join(root, 'vo/v'), { recursive: true });
      writeFileSync(path.join(root, 'vo/v/a.mp3'), 'test');
      writeFileSync(path.join(root, 'vo/v/b.mp3'), 'test');
      expect(missingClips(manifest, root)).toEqual([]);
      expect(() => requireNarration(storyboard, manifest, root)).not.toThrow();
      expect(
        missingClips(manifest, root, (file) => file.endsWith('/a.mp3')),
      ).toEqual(['b']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

it('preserves legacy fingerprints and never reads assets for plain lines', () => {
  const digest = vi.fn();
  expect(lineFingerprint({ id: 'a', text: 'Hello.' }, voice, { digest })).toBe(
    '152bbf892c28d0f0',
  );
  expect(digest).not.toHaveBeenCalled();
});
it('invalidates only brand lines on clip bytes or assembly settings changing', () => {
  const settings = { voice: 'adrian' as const, speed: 1 };
  const clips = {
    kokode: { ...BRAND_CLIPS['kokode']!, status: 'approved' as const },
  };
  const line = { id: 'a', text: 'Kokode. Hello.' };
  const context = { clips, digest: vi.fn(() => 'one'), publicDir: '/assets' };
  const original = lineFingerprint(line, settings, context);
  expect(
    lineFingerprint(line, settings, { ...context, digest: () => 'two' }),
  ).not.toBe(original);
  expect(lineFingerprint(line, settings, { ...context, keep: 0.01 })).not.toBe(
    original,
  );
  expect(
    lineFingerprint(line, settings, { ...context, assemblyVersion: 2 }),
  ).not.toBe(original);
  expect(
    lineFingerprint(line, settings, {
      ...context,
      clips: { kokode: { ...clips.kokode, gainDb: 1 } },
    }),
  ).not.toBe(original);
  const sb = {
    ...storyboard,
    voice: settings,
    scenes: [
      { ...storyboard.scenes[0]!, vo: [line, { id: 'b', text: 'Plain.' }] },
    ],
  };
  const manifest = {
    videoId: 'v',
    engine: 'e',
    voiceKey: 'k',
    lines: {
      a: clip(original),
      b: clip(lineFingerprint({ id: 'b', text: 'Plain.' }, settings)),
    },
  };
  expect(staleLines(sb, manifest, context)).toEqual([]);
  expect(staleLines(sb, manifest, { ...context, digest: () => 'two' })).toEqual(
    ['a'],
  );
  expect(context.digest).toHaveBeenCalledWith(
    '/assets/brand/audio/kokode-adrian-ja.mp3',
  );
});
it('digests fresh file bytes each time and explains missing files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'digest-'));
  const file = path.join(dir, 'clip.mp3');
  try {
    writeFileSync(file, 'one');
    const first = fileDigest(file);
    writeFileSync(file, 'two');
    expect(fileDigest(file)).not.toBe(first);
    expect(() => fileDigest(path.join(dir, 'missing'))).toThrow(
      'pnpm video:brand-audio',
    );
    expect(() => fileDigest(dir)).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('uses the default public directory and disk digest for approved clips', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fingerprint-file-'));
  const file = path.join(dir, 'source.mp3');
  writeFileSync(file, 'raw');
  const settings = { voice: 'adrian' as const, speed: 1 };
  const line = { id: 'brand', text: 'Kokode' };
  const clips = {
    kokode: {
      ...BRAND_CLIPS['kokode']!,
      status: 'approved' as const,
      file: 'source.mp3',
    },
  };
  try {
    const digest = vi.fn(() => 'digest');
    lineFingerprint(line, settings, { clips, digest });
    expect(digest).toHaveBeenCalledWith(
      expect.stringContaining('/apps/video/public/source.mp3'),
    );
    const before = lineFingerprint(line, settings, { clips, publicDir: dir });
    writeFileSync(file, 'changed');
    expect(lineFingerprint(line, settings, { clips, publicDir: dir })).not.toBe(
      before,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
