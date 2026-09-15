import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharpMocks = vi.hoisted(() => ({
  metadata: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({ metadata: sharpMocks.metadata })),
}));

import { createGeneratedSlideAsset } from './generated-slide.js';

const copy = {
  kicker: 'Market signal',
  headline: 'Liquidity is returning',
  points: ['Flows improved', 'Volatility fell'],
  source: 'deterministic' as const,
  model: null,
  costUsd: null,
};

async function request(signal?: AbortSignal) {
  return {
    assetId: 'image-01',
    scene: {
      sceneId: 'scene-01',
      imageSearchIntent: ['market liquidity'],
      imageSearchEntities: ['Bitcoin'],
    },
    title: 'A market update',
    evidence: { text: 'Fallback evidence', searchText: 'Preferred evidence' },
    reason: 'candidate-exhaustion' as const,
    rejectionSummary: 'decorative: 2',
    lead: true,
    workingDirectory: await mkdtemp(join(tmpdir(), 'generated-slide-')),
    ...(signal ? { signal } : {}),
  };
}

beforeEach(() => {
  sharpMocks.metadata
    .mockReset()
    .mockResolvedValue({ width: 1200, height: 675 });
});

describe('createGeneratedSlideAsset', () => {
  it('executes copy, rasterization, hashing, and slide metadata', async () => {
    const writeCopy = vi.fn().mockResolvedValue(copy);
    const rasterize = vi.fn(async (_input, paths) => {
      await writeFile(paths.output, Buffer.from('rendered concept card'));
    });
    const fingerprint = vi.fn().mockResolvedValue('0123456789abcdef');
    const input = await request();

    const result = await createGeneratedSlideAsset(input, {
      writeCopy,
      rasterize,
      fingerprint,
    });

    expect(writeCopy).toHaveBeenCalledWith({
      title: input.title,
      evidence: 'Preferred evidence',
      entities: ['Bitcoin'],
      intent: ['market liquidity'],
      lead: true,
    });
    expect(rasterize).toHaveBeenCalledWith(
      {
        kicker: copy.kicker,
        headline: copy.headline,
        points: copy.points,
      },
      expect.objectContaining({
        output: expect.stringContaining(
          '/generated-slides/scene-01/concept-card.png',
        ),
      }),
      {},
    );
    expect(fingerprint).toHaveBeenCalledWith(result.path);
    expect(result).toMatchObject({
      assetId: 'image-01',
      provider: 'generated-slide',
      license: 'brand-generated',
      width: 1200,
      height: 675,
      perceptualHash: '0123456789abcdef',
      originalImageUrl: 'generated://concept-card/scene-01',
      slide: {
        templateVersion: 'concept-card-v1',
        copySource: 'deterministic',
        reason: 'candidate-exhaustion',
        rejectionSummary: 'decorative: 2',
        lead: true,
      },
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stops before invoking dependencies when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const writeCopy = vi.fn();

    await expect(
      createGeneratedSlideAsset(await request(controller.signal), {
        writeCopy,
      }),
    ).rejects.toThrow('cancelled');
    expect(writeCopy).not.toHaveBeenCalled();
  });

  it.each([
    [{ width: undefined, height: 675 }, 'width'],
    [{ width: 1200, height: undefined }, 'height'],
  ])('rejects output without image dimensions (%s)', async (metadata) => {
    sharpMocks.metadata.mockResolvedValue(metadata);
    const rasterize = vi.fn(async (_input, paths) => {
      await writeFile(paths.output, Buffer.from('invalid image metadata'));
    });

    await expect(
      createGeneratedSlideAsset(await request(), {
        writeCopy: vi.fn().mockResolvedValue(copy),
        rasterize,
        fingerprint: vi.fn(),
      }),
    ).rejects.toThrow('scene-01 has no dimensions');
  });
});
