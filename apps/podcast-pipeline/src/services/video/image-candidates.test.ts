import { describe, expect, it } from 'vitest';

import type { ImageCandidate } from '../../types.js';
import {
  filterImageCandidates,
  partitionImageCandidates,
  validateImageCandidate,
} from './image-candidates.js';

function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    imageUrl: 'https://media.example.test/image.jpg',
    sourceUrl: 'https://publisher.example.test/article',
    origin: 'bing',
    width: 1600,
    height: 900,
    ...overrides,
  };
}

describe('validateImageCandidate', () => {
  it('accepts an HTTPS raster candidate that meets a planner quality policy', () => {
    const result = validateImageCandidate(candidate(), {
      requireDimensions: true,
      minLongEdge: 1200,
      minShortEdge: 600,
      minAspectRatio: 1,
      maxAspectRatio: 2,
    });

    expect(result).toEqual({
      candidate: candidate(),
      valid: true,
      issues: [],
    });
  });

  it.each([
    {
      name: 'insecure image URL',
      value: candidate({ imageUrl: 'http://media.example.test/image.jpg' }),
      code: 'insecure-image-url',
    },
    {
      name: 'Bing thumbnail host',
      value: candidate({
        imageUrl: 'https://tse1.mm.bing.net/th/id/example',
      }),
      code: 'blocked-image-host',
    },
    {
      name: 'unsupported animated extension',
      value: candidate({
        imageUrl: 'https://media.example.test/animation.GIF?size=large',
      }),
      code: 'blocked-image-extension',
    },
    {
      name: 'credential-bearing source URL',
      value: candidate({
        sourceUrl: 'https://user:password@publisher.example.test/article',
      }),
      code: 'invalid-source-url',
    },
    {
      name: 'missing dimensions',
      value: candidate({ width: undefined, height: undefined }),
      code: 'missing-dimensions',
      policy: { requireDimensions: true },
    },
    {
      name: 'small short edge',
      value: candidate({ width: 1200, height: 300 }),
      code: 'image-short-edge-too-small',
      policy: { minShortEdge: 600 },
    },
  ])('rejects a $name', ({ value, code, policy }) => {
    const result = validateImageCandidate(value, policy);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it('supports planner-owned hostname, extension, and origin blocks', () => {
    const result = validateImageCandidate(
      candidate({
        imageUrl: 'https://img.blocked.example.test/photo.custom',
        origin: 'article',
      }),
      {
        allowedOrigins: ['bing'],
        blockedHostnames: ['blocked.example.test'],
        blockedExtensions: ['custom'],
      },
    );

    expect(result.issues.map((issue) => issue.code)).toEqual([
      'blocked-image-host',
      'blocked-image-extension',
      'disallowed-origin',
    ]);
  });
});

describe('filterImageCandidates', () => {
  it('preserves candidate order while filtering invalid and duplicate URLs', () => {
    const first = candidate();
    const duplicate = candidate({
      imageUrl: 'https://media.example.test/image.jpg#duplicate',
      altText: 'Duplicate',
    });
    const second = candidate({
      imageUrl: 'https://media.example.test/second.webp',
    });
    const blocked = candidate({
      imageUrl: 'https://media.example.test/animation.gif',
    });

    expect(filterImageCandidates([first, duplicate, second, blocked])).toEqual([
      first,
      second,
    ]);
  });

  it('reports validation, duplicate, and planner-limit rejections', () => {
    const first = candidate();
    const duplicate = candidate({
      imageUrl: 'https://media.example.test/image.jpg#duplicate',
    });
    const overLimit = candidate({
      imageUrl: 'https://media.example.test/second.png',
    });
    const invalid = candidate({
      imageUrl: 'https://media.example.test/animation.svg',
    });

    const result = partitionImageCandidates(
      [first, duplicate, overLimit, invalid],
      { maxCandidates: 1 },
    );

    expect(result.accepted).toEqual([first]);
    expect(
      result.rejected.map((rejection) => rejection.issues[0]?.code),
    ).toEqual([
      'duplicate-image',
      'candidate-limit',
      'blocked-image-extension',
    ]);
  });
});
