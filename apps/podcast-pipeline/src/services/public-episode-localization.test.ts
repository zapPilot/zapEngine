import { describe, expect, it } from 'vitest';

import {
  episodeFeedResponse,
  episodeListResponse,
  feedRow,
  listRow,
} from '../__fixtures__/index-test.js';
import {
  localizePublicEpisode,
  localizePublicEpisodeFeed,
  localizePublicSearchResult,
} from './public-episode-localization.js';

describe('public episode Chinese localization', () => {
  it('converts zh-Hant feed titles to Taiwan Traditional without mutating canonical data', () => {
    const canonical = episodeFeedResponse(feedRow({ title: '网络软件与鼠标' }));
    canonical.audioTracks.push({
      languageCode: 'ja',
      title: '市場のソフトウェア',
      hlsUrl: 'https://cdn.example.com/ja.m3u8',
      classroomHlsUrl: null,
      classrooms: [],
    });

    const localized = localizePublicEpisodeFeed(canonical);

    expect(localized.title).toBe('網路軟體與滑鼠');
    expect(localized.audioTracks[0]?.title).toBe('網路軟體與滑鼠');
    expect(localized.audioTracks[1]?.title).toBe('市場のソフトウェア');
    expect(canonical.title).toBe('网络软件与鼠标');
  });

  it('leaves non-Chinese feeds untouched', () => {
    const episode = episodeFeedResponse(
      feedRow({ language_code: 'en', title: 'Network software' }),
    );

    expect(localizePublicEpisodeFeed(episode)).toBe(episode);
  });

  it('converts zh-Hant transcript and source-language classroom explanations only', () => {
    const episode = episodeListResponse(
      listRow({
        title: '网络软件',
        script: '鼠标和自行车市场。',
        language_classrooms: [
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'ja',
            oneLiner: '网络软件正在改变市场。',
            keywords: [
              {
                term: 'ネットワーク',
                reading: 'ねっとわーく',
                meaning: '网络软件',
                note: '鼠标示例',
              },
              {
                term: '市場',
                reading: 'しじょう',
                meaning: '自行车市场',
                note: null,
              },
            ],
          },
          {
            sourceLanguageCode: 'ja',
            targetLanguageCode: 'en',
            oneLiner: 'ネットワーク市場',
            keywords: [],
          },
        ],
      }),
    );

    const localized = localizePublicEpisode(episode);

    expect(localized.title).toBe('網路軟體');
    expect(localized.script).toBe('滑鼠和腳踏車市場。');
    expect(localized.languageClassrooms[0]).toEqual({
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCode: 'ja',
      oneLiner: '網路軟體正在改變市場。',
      keywords: [
        {
          term: 'ネットワーク',
          reading: 'ねっとわーく',
          meaning: '網路軟體',
          note: '滑鼠示例',
        },
        {
          term: '市場',
          reading: 'しじょう',
          meaning: '腳踏車市場',
          note: null,
        },
      ],
    });
    expect(localized.languageClassrooms[1]).toEqual(
      episode.languageClassrooms[1],
    );
  });

  it('preserves null transcripts and converts search snippets at the public boundary', () => {
    const episode = episodeListResponse(
      listRow({ title: '网络市场', script: null }),
    );

    expect(localizePublicEpisode(episode).script).toBeNull();
    expect(
      localizePublicSearchResult({
        episode,
        matchSource: 'title',
        snippet: '鼠标和自行车市场。',
      }),
    ).toMatchObject({
      episode: { title: '網路市場' },
      snippet: '滑鼠和腳踏車市場。',
    });
  });

  it('leaves non-Chinese search results untouched and preserves null snippets', () => {
    const english = episodeListResponse(
      listRow({
        language_code: 'en',
        title: 'Network market',
        script: 'Mouse market.',
      }),
    );
    const englishResult = {
      episode: english,
      matchSource: 'title' as const,
      snippet: 'Mouse market.',
    };
    expect(localizePublicSearchResult(englishResult)).toBe(englishResult);

    const chinese = episodeListResponse(
      listRow({ title: '网络市场', script: '市场。' }),
    );
    expect(
      localizePublicSearchResult({
        episode: chinese,
        matchSource: 'title',
        snippet: null,
      }).snippet,
    ).toBeNull();
  });
});
