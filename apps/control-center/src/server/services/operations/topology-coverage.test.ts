import { describe, expect, it } from 'vitest';

import { resolveOperationalTopology } from './topology.js';

describe('topology coverage', () => {
  it('resolves a process-group key without an app boundary as unmapped', () => {
    const result = resolveOperationalTopology('fly:process-group/singleton');

    expect(result.service).toBeNull();
    expect(result.relatedFingerprints).toEqual({
      github: null,
      sentry: null,
      fly: null,
    });
  });

  it('routes a render repair incident to the podcast render group', () => {
    const result = resolveOperationalTopology(
      'social-queue:render/123e4567-e89b-12d3-a456-426614174000',
    );

    expect(result.service?.impact).toBe('social-media');
    expect(result.relatedFingerprints.fly).toBe(
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(result.entities.map((entity) => entity.type)).toContain('fly-app');
  });

  it('keeps an unknown process-group app unmapped instead of guessing', () => {
    expect(
      resolveOperationalTopology('fly:process-group/unknown/app').service,
    ).toBeNull();
  });
});
