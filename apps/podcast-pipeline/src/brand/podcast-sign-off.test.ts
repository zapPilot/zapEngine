import {
  isLive,
  ONE_LINER,
  SLOGAN,
  STATUS_LABEL,
} from '@zapengine/zap-pilot-story/brand';
import { CAPABILITIES } from '@zapengine/zap-pilot-story/facts';
import { describe, expect, it } from 'vitest';

import {
  isKnownPodcastIntro,
  packagePodcastScript,
  splitPodcastVisualSections,
  stripKnownPodcastPackaging,
} from '../services/podcast-packaging.js';
import {
  PODCAST_PACKAGING_VERSION,
  PODCAST_SIGN_OFF,
} from './podcast-sign-off.js';
describe('frozen podcast brand identity', () => {
  it('pins the packaging version and truthful spoken English identity', () => {
    expect(PODCAST_PACKAGING_VERSION).toBe('podcast-script.v2');
    expect(isLive('self-hosting')).toBe(false);
    expect(STATUS_LABEL[CAPABILITIES['self-hosting'].status]).toBe('Planned');
    expect(PODCAST_SIGN_OFF.en.outro).toContain(
      ONE_LINER.building.slice(0, -1),
    );
    const spoken = SLOGAN.toLowerCase()
      .replaceAll('. ', ', ')
      .replace(/\.$/, '');
    for (const copy of Object.values(PODCAST_SIGN_OFF)) {
      expect(copy.outro.toLowerCase()).toContain(spoken);
      expect(copy.outro.slice(0, -1)).not.toMatch(/[.!?！？；;\n]/);
    }
  });
  it.each(['zh-Hant', 'ja', 'en'] as const)(
    'packages only the body in %s',
    (language) => {
      const script = packagePodcastScript('市场正文。', language);
      expect(script).toBe(
        `${PODCAST_SIGN_OFF[language].intro}\n\n市场正文。\n\n${PODCAST_SIGN_OFF[language].outro}`,
      );
      expect(stripKnownPodcastPackaging(script)).toBe('市场正文。');
      expect(isKnownPodcastIntro(PODCAST_SIGN_OFF[language].intro)).toBe(true);
      expect(splitPodcastVisualSections(script).isPackaged).toBe(true);
    },
  );
});
