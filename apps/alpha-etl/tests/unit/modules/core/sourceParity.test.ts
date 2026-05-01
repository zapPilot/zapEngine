import { DATA_SOURCES } from '@zapengine/types/api';
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CURRENT_SOURCES,
  SOURCE_CAPABILITIES,
} from '../../../../src/modules/core/sourceCapabilities.js';
import { PROCESSOR_REGISTRY } from '../../../../src/modules/core/processorRegistry.js';

describe('ETL source parity', () => {
  it('keeps processor registry keys aligned with DATA_SOURCES', () => {
    expect(Object.keys(PROCESSOR_REGISTRY).sort()).toEqual(
      [...DATA_SOURCES].sort(),
    );
  });

  it('keeps source capabilities aligned with DATA_SOURCES', () => {
    expect(Object.keys(SOURCE_CAPABILITIES).sort()).toEqual(
      [...DATA_SOURCES].sort(),
    );
  });

  it('defaults to every current-capable source', () => {
    const currentCapableSources = DATA_SOURCES.filter(
      (source) => SOURCE_CAPABILITIES[source].current,
    );

    expect(DEFAULT_CURRENT_SOURCES).toEqual(currentCapableSources);
  });
});

