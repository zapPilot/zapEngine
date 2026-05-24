import type {
  EpisodeListRow,
  EpisodeLocalizationRow,
  EpisodeResponse,
  EpisodeRow,
  LanguageClassroomRow,
} from '../types.js';

const FIXED_TIMESTAMP = '2024-01-01T00:00:00.000Z';

export function localizationResponse(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageClassrooms: LanguageClassroomRow[],
): EpisodeResponse {
  return {
    id: episode.id,
    localizationId: localization.id,
    title: localization.title,
    languageCode: localization.language_code,
    hlsUrl: localization.hls_url,
    audioTracks: [
      {
        languageCode: localization.language_code,
        title: localization.title,
        hlsUrl: localization.hls_url,
        classroomHlsUrl: localization.classroom_hls_url,
      },
    ],
    createdAt: episode.created_at,
    listened: episode.listened,
    script: localization.script,
    llmModel: localization.llm_model,
    llmThinkingModel: localization.llm_thinking_model,
    llmProvider: localization.llm_provider,
    status: localization.status,
    languageClassrooms: languageClassrooms.map((classroom) => ({
      sourceLanguageCode: classroom.source_language_code,
      targetLanguageCode: classroom.target_language_code,
      oneLiner: classroom.one_liner,
      keywords: classroom.keywords,
    })),
  };
}

export function episodeListResponse(
  row: EpisodeListRow,
  languageClassroomRows?: LanguageClassroomRow[],
): EpisodeResponse {
  const rawLanguageClassrooms =
    languageClassroomRows ?? row.language_classrooms;
  const languageClassrooms = Array.isArray(rawLanguageClassrooms)
    ? rawLanguageClassrooms.map((classroom) => {
        const value = classroom as Record<string, unknown>;
        return {
          sourceLanguageCode: (value['sourceLanguageCode'] ??
            value['source_language_code']) as string,
          targetLanguageCode: (value['targetLanguageCode'] ??
            value['target_language_code']) as string,
          oneLiner: (value['oneLiner'] ?? value['one_liner']) as string,
          keywords: (value['keywords'] ?? []) as [],
        };
      })
    : [];

  return {
    id: row.episode_id,
    localizationId: row.localization_id,
    title: row.title,
    languageCode: row.language_code,
    hlsUrl: row.hls_url,
    audioTracks: [
      {
        languageCode: row.language_code,
        title: row.title,
        hlsUrl: row.hls_url,
        classroomHlsUrl: row.classroom_hls_url,
      },
    ],
    createdAt: row.created_at,
    listened: row.listened,
    script: row.script,
    llmModel: row.llm_model,
    llmThinkingModel: row.llm_thinking_model,
    llmProvider: row.llm_provider,
    status: row.status,
    languageClassrooms,
  };
}

export function episodeRow(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    source_url: 'https://example.com/article',
    source_title: 'Source title',
    created_at: FIXED_TIMESTAMP,
    listened: false,
    ...overrides,
  };
}

export function localizationRow(
  overrides: Partial<EpisodeLocalizationRow> = {},
): EpisodeLocalizationRow {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    episode_id: episodeRow().id,
    language_code: 'zh-Hant',
    title: 'Localization title',
    hls_url: 'https://cdn.example.com/playlist.m3u8',
    classroom_hls_url: null,
    raw_text: 'Article text',
    script: 'Script',
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    tts_language_code: null,
    tts_voice_name: null,
    r2_prefix: null,
    classroom_r2_prefix: null,
    status: 'completed',
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function listRow(
  overrides: Partial<EpisodeListRow> = {},
): EpisodeListRow {
  return {
    id: episodeRow().id,
    episode_id: episodeRow().id,
    localization_id: localizationRow().id,
    title: 'Localization title',
    language_code: 'zh-Hant',
    hls_url: 'https://cdn.example.com/playlist.m3u8',
    classroom_hls_url: null,
    script: 'Script',
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    status: 'completed',
    created_at: FIXED_TIMESTAMP,
    listened: false,
    like_count: 0,
    language_classrooms: [],
    ...overrides,
  };
}

export function classroomRow(
  overrides: Partial<LanguageClassroomRow> = {},
): LanguageClassroomRow {
  return {
    id: 'classroom-ja',
    episode_localization_id: localizationRow().id,
    source_language_code: 'zh-Hant',
    target_language_code: 'ja',
    one_liner: 'この記事は市場流動性を説明します。',
    keywords: [],
    llm_model: 'model',
    llm_thinking_model: null,
    llm_provider: 'provider',
    created_at: FIXED_TIMESTAMP,
    updated_at: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function telegramUpdate({
  fromId = 12345,
  chatId = 67890,
  text,
}: {
  fromId?: number;
  chatId?: number;
  text: string;
}) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: fromId, is_bot: false, first_name: 'Tester' },
      chat: { id: chatId, type: 'private' },
      date: 1,
      text,
    },
  };
}

export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}
