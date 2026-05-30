import { describe, expect, it, vi } from 'vitest';

import type { Article } from '../../types.js';
import { normalizeArticleForLanguage } from './script-stage.js';

vi.mock('../opencc.js', () => ({
  convertArticleToZhTW: vi.fn((a: Article) => a),
}));

vi.mock('../db.js', () => ({
  findEpisodeBySourceUrl: vi.fn(),
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  insertEpisode: vi.fn(),
  insertEpisodeLocalization: vi.fn(),
  updateEpisodeLocalizationArticleContent: vi.fn(),
  updateEpisodeLocalizationStatus: vi.fn(),
}));

vi.mock('../scrape.js', () => ({
  scrapeArticle: vi.fn(),
}));

vi.mock('../llm.js', () => ({
  generateScriptWithLLM: vi.fn(),
}));

vi.mock('./step.js', () => ({
  step: vi.fn(),
}));

describe('normalizeArticleForLanguage', () => {
  it('returns the article unchanged for a non-default language code', () => {
    const article: Article = { title: 'Test', text: 'Body' };
    expect(normalizeArticleForLanguage(article, 'en')).toBe(article);
  });
});
