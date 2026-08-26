import { describe, expect, it } from 'vitest';

import {
  laneLabel,
  languageFlag,
  languageLabel,
  platformIcon,
  platformLabel,
} from './log-format.js';

describe('log-format', () => {
  it('maps known languages to flags', () => {
    expect(languageFlag('zh-Hant')).toBe('🇹🇼');
    expect(languageFlag('ja')).toBe('🇯🇵');
    expect(languageFlag('en')).toBe('🇺🇸');
  });

  it('falls back for unknown language', () => {
    expect(languageFlag('fr')).toBe('🌐');
    expect(languageFlag('unknown')).toBe('🌐');
  });

  it('maps known platforms to icons', () => {
    expect(platformIcon('rednote')).toBe('🔴');
    expect(platformIcon('x')).toBe('𝕏');
    expect(platformIcon('youtube')).toBe('▶️');
    expect(platformIcon('threads')).toBe('🧵');
  });

  it('falls back for unknown platform', () => {
    expect(platformIcon('unknown')).toBe('❓');
  });

  it('formats platform and language labels', () => {
    expect(platformLabel('rednote')).toBe('🔴 rednote');
    expect(languageLabel('zh-Hant')).toBe('🇹🇼 zh-Hant');
    expect(languageLabel('en')).toBe('🇺🇸 en');
  });

  it('formats lane labels', () => {
    expect(laneLabel('rednote', 'zh-Hant')).toBe('🔴 rednote 🇹🇼 zh-Hant');
    expect(laneLabel('x', 'ja')).toBe('𝕏 x 🇯🇵 ja');
    expect(laneLabel('youtube', 'en')).toBe('▶️ youtube 🇺🇸 en');
  });

  it('falls back for unknown lane components', () => {
    expect(laneLabel('unknown', 'fr')).toBe('❓ unknown 🌐 fr');
  });

  it('keeps original identifiers for grep', () => {
    const label = laneLabel('rednote', 'zh-Hant');
    expect(label).toContain('rednote');
    expect(label).toContain('zh-Hant');
  });
});
