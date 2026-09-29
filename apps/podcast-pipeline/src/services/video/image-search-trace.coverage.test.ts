import { describe, expect, it } from 'vitest';

import {
  appendImageSearchProgress,
  createImageSearchTrace,
  formatImageSearchSummary,
  tracedCandidates,
  type VisualImageSearchRequest,
  type VisualSceneSelection,
} from './image-search-trace.js';

function request(index: number): VisualImageSearchRequest {
  return {
    kind: 'primary',
    subjectKey: `subject-${index}`,
    subjectLabel: `Subject ${index}`,
    query: `query ${index}`,
    sceneId: null,
    returned: 0,
    viable: 0,
    drops: [],
    candidates: [],
    error: null,
  };
}

function selection(index: number): VisualSceneSelection {
  return {
    sceneId: `scene-${String(index).padStart(2, '0')}`,
    subjectKey: null,
    matchedSubjectKey: null,
    selection: 'exhausted',
    sourceQuery: null,
    providerRank: null,
    fallbackReason: 'pool-exhausted',
    visualCue: null,
    cueMatched: null,
    rejections: [],
  };
}

describe('image search trace coverage', () => {
  it('caps retained requests while still counting attempts and budget exhaustion', () => {
    const trace = createImageSearchTrace({ primary: 0, targeted: 0, max: 1 });

    for (let index = 0; index < 17; index += 1) {
      appendImageSearchProgress(trace, { request: request(index) });
    }

    expect(trace.requestCount).toBe(17);
    expect(trace.requests).toHaveLength(16);
    expect(trace.budgetExhausted).toBe(true);
  });

  it('caps retained scene selections after the trace reaches its scene limit', () => {
    const trace = createImageSearchTrace({ primary: 0, targeted: 0, max: 100 });

    for (let index = 1; index <= 65; index += 1) {
      appendImageSearchProgress(trace, { selection: selection(index) });
    }

    expect(trace.scenes).toHaveLength(64);
    expect(trace.scenes.at(-1)?.sceneId).toBe('scene-64');
  });

  it('sorts equal drop counts by cause name', () => {
    expect(
      formatImageSearchSummary({
        pool: 0,
        attempted: 0,
        requests: 0,
        requestBudget: 0,
        returned: 0,
        viable: 0,
        drops: new Map([
          ['zeta', 2],
          ['alpha', 2],
        ]),
      }),
    ).toContain('viableDrops=alpha:2,zeta:2');

    expect(
      formatImageSearchSummary({
        pool: 0,
        attempted: 0,
        requests: 0,
        requestBudget: 0,
        returned: 0,
        viable: 0,
        drops: new Map([
          ['large', 3],
          ['small', 1],
        ]),
      }),
    ).toContain('viableDrops=large:3,small:1');
  });

  it('drops candidates whose image or source URL exceeds trace bounds', () => {
    const long = `https://example.test/${'x'.repeat(700)}`;
    const valid = {
      imageUrl: 'https://example.test/image.jpg',
      sourceUrl: 'https://example.test/article',
      altText: null,
    };

    expect(
      tracedCandidates(
        [
          { ...valid, imageUrl: long },
          { ...valid, sourceUrl: long },
        ] as never,
        new Map(),
      ),
    ).toEqual([]);
  });
});
