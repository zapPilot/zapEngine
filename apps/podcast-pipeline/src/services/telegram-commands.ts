import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import { errorMessage } from '../lib/errorMessage.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { isEpisodeId, parseInputUrl } from './request-validation.js';
import {
  getPipelineSupabase,
  isMissingSupabaseRpc,
  throwSupabaseError,
} from './supabase-client.js';
import {
  answerTelegramCallbackQuery,
  TELEGRAM_HELP_TEXT,
  type TelegramChatId,
  type TelegramCommand,
} from './telegram.js';
import type { TelegramIngestQueue } from './telegram-ingest-queue.js';
import { retryEpisodeVideoGeneration } from './video-jobs.js';

const PRIMARY_LANGUAGES = ['zh-Hant', 'ja', 'en'] as const;

export interface TelegramEpisodeTarget {
  episodeId: string;
  sourceUrl: string;
}

interface LocalizationStatusRow {
  id: string;
  language_code: string;
  status: string;
  script: string | null;
  hls_url: string | null;
  classroom_hls_url: string | null;
}

interface VisualStatusRow {
  status: string;
  progress_stage: string | null;
  progress_percent: number | null;
  last_error: string | null;
  visual_version: string | null;
}

interface RenderStatusRow extends VisualStatusRow {
  episode_localization_id: string;
}

export async function resolveTelegramEpisodeTarget(
  value: string,
): Promise<TelegramEpisodeTarget | null> {
  const input = value.trim();
  const supabase = getPipelineSupabase();
  if (isEpisodeId(input)) {
    const { data, error } = await supabase
      .from('episodes')
      .select('id,source_url')
      .eq('id', input)
      .maybeSingle<{ id: string; source_url: string }>();
    if (error) throwSupabaseError(error);
    return data ? { episodeId: data.id, sourceUrl: data.source_url } : null;
  }

  let sourceUrl: string;
  try {
    sourceUrl = parseInputUrl(input);
  } catch {
    return null;
  }
  const { data, error } = await supabase
    .from('episodes')
    .select('id,source_url')
    .eq('source_url', sourceUrl)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throwSupabaseError(error);
  const row = Array.isArray(data) ? data[0] : undefined;
  return row ? { episodeId: row.id, sourceUrl: row.source_url } : null;
}

export async function handleTelegramRetryCommand(input: {
  chatId: TelegramChatId;
  target: string;
  queue: TelegramIngestQueue;
}): Promise<string> {
  const target = await resolveTelegramEpisodeTarget(input.target);
  if (!target) return '找不到這集 podcast，請確認 URL 或 episode id。';

  const localizations = await loadLocalizationStatuses(target.episodeId);
  if (!audioReady(localizations)) {
    input.queue.enqueue(input.chatId, target.sourceUrl, 'zh-Hant');
    return '已從最後完成的音頻 checkpoint 重新排程。';
  }

  const outcome = await retryEpisodeVideoGeneration(target.episodeId);
  switch (outcome) {
    case 'queued':
      return '已重新排程影片；既有完成的 visual checkpoint 會保留。';
    case 'processing':
      return '這集影片目前仍在處理中，沒有清除 live lease。';
    case 'completed':
      return '這集三語影片已完成。';
    case 'missing':
      return '這集還沒有 visual job；請重新貼原始 URL 建立影片工作。';
    case 'abandoned':
      return '這集影片已由操作者結案，不再重排；要重開請清除結案標記。';
    case 'prerequisites':
      return '影片重試的三語音頻前置條件尚未完成。';
    case 'unavailable':
      return '資料庫尚未升級到影片重試 migration。';
  }
}

export async function handleTelegramRetryVideoCallback(
  episodeId: string,
): Promise<string> {
  const outcome = await retryEpisodeVideoGeneration(episodeId);
  switch (outcome) {
    case 'queued':
      return '影片已重新排程';
    case 'processing':
      return '影片仍在處理中';
    case 'completed':
      return '影片已完成';
    case 'unavailable':
      return '資料庫尚未升級';
    case 'missing':
      return '找不到 visual job';
    case 'abandoned':
      return '影片已結案，不再重排';
    case 'prerequisites':
      return '音頻前置條件未完成';
  }
}

export async function handleTelegramStatusCommand(
  episodeId: string,
): Promise<string> {
  if (!isEpisodeId(episodeId)) return '用法：/status <episodeId>';
  const target = await resolveTelegramEpisodeTarget(episodeId);
  if (!target) return '找不到這集 podcast。';
  const supabase = getPipelineSupabase();
  const [localizations, visualResult, rendersResult] = await Promise.all([
    loadLocalizationStatuses(episodeId),
    supabase
      .from('episode_video_visuals')
      .select(
        'status,progress_stage,progress_percent,last_error,visual_version',
      )
      .eq('episode_id', episodeId)
      .maybeSingle<VisualStatusRow>(),
    supabase
      .from('episode_videos')
      .select(
        'episode_localization_id,status,progress_stage,progress_percent,last_error,visual_version',
      )
      .eq('episode_id', episodeId),
  ]);
  if (visualResult.error) throwSupabaseError(visualResult.error);
  if (rendersResult.error) throwSupabaseError(rendersResult.error);

  const localizationById = new Map(localizations.map((row) => [row.id, row]));
  const renderByLanguage = new Map<string, RenderStatusRow>();
  for (const render of (rendersResult.data ?? []) as RenderStatusRow[]) {
    const localization = localizationById.get(render.episode_localization_id);
    if (localization) renderByLanguage.set(localization.language_code, render);
  }
  const visual = visualResult.data;
  const visualStatus = visual
    ? formatJobStatus(
        visual.status,
        visual.progress_stage,
        visual.progress_percent,
        visual.last_error,
      )
    : 'not scheduled';
  const stale =
    visual &&
    visual.status !== 'completed' &&
    visual.visual_version !== EPISODE_VIDEO_VISUAL_VERSION;

  const lines = [
    `Episode ${episodeId}`,
    ...PRIMARY_LANGUAGES.map((language) => {
      const localization = localizations.find(
        (row) => row.language_code === language,
      );
      const audio = localization
        ? audioReadyForLocalization(localization)
        : false;
      const render = renderByLanguage.get(language);
      return `${language}: script ${localization?.script?.trim() ? '✓' : '—'} · audio ${audio ? '✓' : '—'} · render ${render ? formatJobStatus(render.status, render.progress_stage, render.progress_percent, render.last_error) : 'not scheduled'}`;
    }),
    `visual: ${visualStatus}${visual?.visual_version ? ` · ${visual.visual_version}` : ''}${stale ? ' · STALE VERSION' : ''}`,
  ];
  return lines.join('\n').slice(0, 3500);
}

async function loadLocalizationStatuses(
  episodeId: string,
): Promise<LocalizationStatusRow[]> {
  const { data, error } = await getPipelineSupabase()
    .from('episode_localizations')
    .select('id,language_code,status,script,hls_url,classroom_hls_url')
    .eq('episode_id', episodeId)
    .in('language_code', [...PRIMARY_LANGUAGES]);
  if (error) throwSupabaseError(error);
  return data ?? [];
}

function audioReady(rows: readonly LocalizationStatusRow[]): boolean {
  return PRIMARY_LANGUAGES.every((language) => {
    const row = rows.find((candidate) => candidate.language_code === language);
    return row ? audioReadyForLocalization(row) : false;
  });
}

function audioReadyForLocalization(row: LocalizationStatusRow): boolean {
  return (
    row.status === 'completed' &&
    Boolean(row.script?.trim()) &&
    Boolean(row.hls_url?.trim()) &&
    (row.language_code !== 'zh-Hant' || Boolean(row.classroom_hls_url?.trim()))
  );
}

function formatJobStatus(
  status: string,
  stage: string | null,
  percent: number | null,
  lastError: string | null,
): string {
  const detail =
    status === 'completed'
      ? ''
      : [stage, percent == null ? null : `${percent}%`]
          .filter(Boolean)
          .join(' ');
  const failure = lastError?.trim().split(/\r?\n/u, 1)[0];
  return [status, detail, failure ? `· ${failure.slice(0, 120)}` : '']
    .filter(Boolean)
    .join(' ');
}

export function isTelegramRetryMigrationMissing(error: unknown): boolean {
  return (
    isMissingSupabaseRpc(error, 'restart_podcast_ingest') ||
    isMissingSupabaseRpc(error, 'retry_episode_video_generation')
  );
}

export function telegramCommandErrorText(error: unknown): string {
  if (isTelegramRetryMigrationMissing(error)) return '資料庫尚未升級。';
  return `操作失敗：${errorMessage(error).split(/\r?\n/u, 1)[0]?.slice(0, 160) ?? 'Unknown error'}`;
}

export type { LanguageClassroomLanguageCode };

/**
 * Webhook helpers. Both keep the fast-ack contract: the handler returns before
 * any Supabase work runs, and every reply goes through the queue's scheduler
 * (or the callback answer) so a failure never reaches Telegram as a 500.
 */
export function scheduleTelegramRetryVideoCallback(
  callbackId: string,
  episodeId: string,
  answer: (
    callbackId: string,
    text: string,
  ) => Promise<unknown> = answerTelegramCallbackQuery,
): void {
  process.nextTick(() => {
    void (async () => {
      let text: string;
      try {
        text = await handleTelegramRetryVideoCallback(episodeId);
      } catch (error) {
        text = telegramCommandErrorText(error);
      }
      try {
        await answer(callbackId, text);
      } catch {
        // The callback answer is best effort; the retry itself already ran.
      }
    })();
  });
}

export function dispatchTelegramCommand(input: {
  command: TelegramCommand;
  chatId: TelegramChatId;
  queue: TelegramIngestQueue;
}): void {
  const { command, chatId, queue } = input;
  if (
    command.name === 'start' ||
    command.name === 'help' ||
    command.name === 'unknown'
  ) {
    queue.scheduleMessage(chatId, TELEGRAM_HELP_TEXT);
    return;
  }
  const argument = command.argument;
  if (!argument) {
    queue.scheduleMessage(
      chatId,
      command.name === 'retry'
        ? '用法：/retry <URL|episodeId>'
        : '用法：/status <episodeId>',
    );
    return;
  }
  process.nextTick(() => {
    void (async () => {
      let reply: string;
      try {
        reply =
          command.name === 'retry'
            ? await handleTelegramRetryCommand({
                chatId,
                target: argument,
                queue,
              })
            : await handleTelegramStatusCommand(argument);
      } catch (error) {
        reply = telegramCommandErrorText(error);
      }
      queue.scheduleMessage(chatId, reply);
    })();
  });
}
