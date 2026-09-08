import { describe, expect, it } from 'vitest';

import { buildSubjectCatalogSystemPrompt } from './search-intents.js';
import {
  isGenericVisualSubjectName,
  parseVisualSubjectCatalog,
  VISUAL_SUBJECT_TYPES,
} from './subject-catalog.js';

describe('visual anchor policy', () => {
  it('keeps abstract concepts blocked but allows concrete or recognizable anchors', () => {
    for (const abstract of [
      'AI',
      'artificial intelligence',
      'technology',
      'markets',
      'finance',
      'innovation',
      'governance',
      'blockchain',
    ]) {
      expect(isGenericVisualSubjectName(abstract)).toBe(true);
    }

    for (const anchor of [
      'GPU',
      'data center',
      'servers',
      'Wall Street',
      '華爾街',
      'Silicon Valley',
      '中南海',
      'White House',
    ]) {
      expect(isGenericVisualSubjectName(anchor)).toBe(false);
    }
  });

  it('supports common-noun physical subjects as object anchors', () => {
    expect(VISUAL_SUBJECT_TYPES).toContain('object');
    expect(
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-gpu',
        subjects: [
          {
            id: 'subject-gpu',
            canonicalName: 'GPU',
            type: 'object',
            aliases: [],
            storyRole: 'primary',
            evidenceSceneIds: ['scene-01'],
            searchQueries: ['GPU AI accelerator hardware', 'GPU'],
            identityHints: ['AI accelerator hardware'],
            negativeHints: [],
            officialDomains: [],
          },
        ],
      }).subjects[0],
    ).toMatchObject({
      type: 'object',
      aliases: ['GPU'],
    });
  });

  it('asks the model for visual anchors based on concreteness and story salience', () => {
    const prompt = buildSubjectCatalogSystemPrompt();

    expect(prompt).toContain('visual anchor catalog');
    expect(prompt).toContain('materially central to the story or scene');
    expect(prompt).toContain(
      'Wall Street, the White House, 中南海, and Silicon Valley',
    );
    expect(prompt).toContain('GPU, data center, server rack');
    expect(prompt).toContain(
      'NEVER create an anchor from a broad abstract category',
    );
    expect(prompt).toContain('Use type "object"');
  });
});
