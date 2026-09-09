import { describe, expect, it } from 'vitest';

import {
  fallbackEntryMatchesSceneQuery,
  type PoolSubjectScene,
} from './episode-image-pool.js';

function scene(
  imageSearchIntent: string[],
  imageSearchEntities: string[] = [],
): PoolSubjectScene {
  return {
    sceneId: 'scene-10',
    imageSearchIntent,
    imageSearchEntities,
    searchAnchor: imageSearchEntities.length > 0 ? 'direct' : 'context',
  };
}

describe('fallbackEntryMatchesSceneQuery', () => {
  it('rejects the production Shor fallback for a Bitcoin and BIP-32 scene', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'Shor mathematician' },
        scene(
          [
            'Bitcoin cryptocurrency',
            'Bitcoin',
            'BIP-32 Bitcoin improvement proposal',
          ],
          ['Bitcoin', 'BIP-32', '比特幣'],
        ),
      ),
    ).toBe(false);
  });

  it('keeps a donor whose Brave query overlaps the scene topic', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'Bitcoin cryptocurrency' },
        scene(['BIP-32 Bitcoin improvement proposal'], ['Bitcoin', 'BIP-32']),
      ),
    ).toBe(true);
  });

  it('does not treat generic signature vocabulary alone as topic identity', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'Dilithium lattice-based signature scheme' },
        scene(['Bitcoin digital signature scheme'], ['Bitcoin']),
      ),
    ).toBe(false);
  });

  it('preserves resilient pool fallback for a scene with no concrete query terms', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'Shor mathematician' },
        scene(['digital signature scheme']),
      ),
    ).toBe(true);
  });
});
