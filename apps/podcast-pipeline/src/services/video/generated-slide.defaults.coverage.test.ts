import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeCopy: vi.fn(),
  rasterize: vi.fn(),
  fingerprint: vi.fn(),
  metadata: vi.fn(),
}));

vi.mock('./storyboard/slide-copy.js', () => ({
  writeConceptCardCopy: mocks.writeCopy,
}));

vi.mock('./rasterizer.js', () => ({
  rasterizeConceptCard: mocks.rasterize,
}));

vi.mock('./visual-asset-planner.js', () => ({
  fingerprintImage: mocks.fingerprint,
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({ metadata: mocks.metadata })),
}));

import { createGeneratedSlideAsset } from './generated-slide.js';

const copy = {
  kicker: 'SIGNAL',
  headline: 'Market move',
  points: ['Point one', 'Point two'],
  source: 'deterministic' as const,
  model: null,
  costUsd: null,
};

async function baseRequest() {
  return {
    assetId: 'asset-1',
    scene: {
      sceneId: 'scene-01',
      imageSearchIntent: ['market move'],
    },
    title: 'Fallback title',
    evidence: null,
    reason: 'candidate-exhaustion' as const,
    rejectionSummary: 'none',
    lead: false,
    workingDirectory: await mkdtemp(
      join(tmpdir(), 'generated-slide-defaults-'),
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeCopy.mockResolvedValue(copy);
  mocks.rasterize.mockImplementation(async (_input, paths) => {
    await writeFile(paths.output, Buffer.from('png'));
  });
  mocks.fingerprint.mockResolvedValue('hash');
  mocks.metadata.mockResolvedValue({ width: 1200, height: 675 });
});

describe('generated slide default dependency coverage', () => {
  it('uses all default dependencies and falls back from missing evidence/entities to the title', async () => {
    const request = await baseRequest();

    await expect(createGeneratedSlideAsset(request)).resolves.toMatchObject({
      provider: 'generated-slide',
      width: 1200,
      height: 675,
    });

    expect(mocks.writeCopy).toHaveBeenCalledWith({
      title: 'Fallback title',
      evidence: 'Fallback title',
      entities: [],
      intent: ['market move'],
      lead: false,
    });
    expect(mocks.rasterize).toHaveBeenCalledOnce();
    expect(mocks.fingerprint).toHaveBeenCalledOnce();
  });

  it('falls back from blank search text to evidence text', async () => {
    const request = {
      ...(await baseRequest()),
      evidence: { searchText: '', text: 'Evidence body' },
    };

    await createGeneratedSlideAsset(request);

    expect(mocks.writeCopy).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: 'Evidence body' }),
    );
  });

  it('forwards a live abort signal to copy and rasterization', async () => {
    const controller = new AbortController();
    const request = {
      ...(await baseRequest()),
      evidence: { text: 'Evidence body' },
      signal: controller.signal,
    };

    await createGeneratedSlideAsset(request);

    expect(mocks.writeCopy).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(mocks.rasterize).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { signal: controller.signal },
    );
  });
});
