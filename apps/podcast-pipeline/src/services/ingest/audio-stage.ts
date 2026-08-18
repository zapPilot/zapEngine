import { randomUUID } from 'node:crypto';

import {
  type EpisodeLocalizationRow,
  type EpisodeRow,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from '../../types.js';
import { buildLlmCostLine, type UsageCostLine } from '../cost.js';
import {
  listLanguageClassroomsByLocalizationId,
  updateEpisodeLocalizationStatus,
  updateLanguageClassroomAudio,
  upsertLanguageClassrooms,
} from '../db.js';
import { generateLanguageClassroomsWithLLM } from '../llm.js';
import { synthesizeClassroomAudio } from '../podcast/classroom-audio.js';
import { getTtsMetadata, textToSpeech } from '../tts.js';
import { concatMp3Buffers } from '../tts/audio-concat.js';
import { getClassroomTargetLanguageCodes } from './classroom-config.js';
import { existingLanguageClassroomResult } from './result-builder.js';
import { logIngestSkip, step } from './step.js';
import { cleanTextForTts } from './tts-text-cleansing.js';
import { packageAndUploadHls } from './upload-stage.js';

interface UploadedAudioSection {
  hlsUrl: string;
  r2Prefix: string;
}

export async function ensureLocalizationCompleted(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<{
  localization: EpisodeLocalizationRow;
  classroomRows: LanguageClassroomRow[];
}> {
  const mainAudioReady = isMainAudioReady(localization);
  const classroomAudioReady = isClassroomAudioReady(localization, languageCode);

  if (
    localization.status === 'completed' &&
    (!mainAudioReady || !classroomAudioReady)
  ) {
    localization = await demoteIncompleteCompletedLocalization(
      localization,
      mainAudioReady,
    );
  }

  const classroomRows = await ensureLanguageClassroomsAndRecordCost(
    localization,
    languageCode,
    costBreakdown,
  );

  if (!mainAudioReady || !classroomAudioReady) {
    const uploadedMain = mainAudioReady
      ? null
      : await synthesizeAndUploadMainAudio(
          localization,
          episode.id,
          languageCode,
          costBreakdown,
        );
    if (uploadedMain) {
      localization = await checkpointMainAudio(
        localization,
        uploadedMain,
        languageCode,
      );
    }

    const uploadedClassroom = classroomAudioReady
      ? null
      : await synthesizeAndUploadClassroomAudio(
          episode.id,
          localization,
          languageCode,
          classroomRows,
          costBreakdown,
        );
    if (uploadedClassroom) {
      localization = await checkpointClassroomAudio(
        localization,
        uploadedClassroom,
        languageCode,
      );
    }

    const hlsUrl = uploadedMain?.hlsUrl ?? localization.hls_url;
    const classroomHlsUrl =
      uploadedClassroom?.hlsUrl ?? localization.classroom_hls_url;
    assertRequiredAudioArtifacts(hlsUrl, classroomHlsUrl, languageCode);

    const ttsMetadata = getTtsMetadataForLanguage(languageCode);
    const completedLocalization = await step(
      'updateEpisodeLocalizationStatus:completed',
      () =>
        updateEpisodeLocalizationStatus(localization.id, 'completed', {
          hlsUrl,
          r2Prefix:
            uploadedMain?.r2Prefix ?? localization.r2_prefix ?? undefined,
          classroomHlsUrl: classroomHlsUrl ?? undefined,
          classroomR2Prefix:
            uploadedClassroom?.r2Prefix ??
            localization.classroom_r2_prefix ??
            undefined,
          ttsLanguageCode: ttsMetadata.languageCode,
          ttsVoiceName: ttsMetadata.voiceName,
        }),
    );
    if (!completedLocalization) {
      throw new Error(
        'Failed to retrieve episode localization after audio completion',
      );
    }
    if (completedLocalization.status !== 'completed') {
      throw new Error(
        'Episode localization did not persist the completed audio status',
      );
    }
    assertRequiredAudioArtifacts(
      completedLocalization.hls_url,
      completedLocalization.classroom_hls_url,
      languageCode,
    );
    localization = completedLocalization;
  } else if (localization.status !== 'completed') {
    localization = await markLocalizationCompleted(localization, languageCode);
  } else {
    logIngestSkip('localization audio already ready');
  }

  return { localization, classroomRows };
}

export async function ensureLanguageClassroomsAndRecordCost(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<LanguageClassroomRow[]> {
  const ensuredClassrooms = await ensureLanguageClassrooms(
    localization,
    sourceLanguageCode,
  );
  costBreakdown.push(...ensuredClassrooms.cost);
  assertLanguageClassroomsReady(ensuredClassrooms.rows, sourceLanguageCode);
  return ensuredClassrooms.rows;
}

export function isAudioReady(localization: EpisodeLocalizationRow): boolean {
  if (localization.status !== 'completed') {
    return false;
  }

  return (
    hasNonEmptyString(localization.hls_url) &&
    isClassroomAudioReady(
      localization,
      localization.language_code as LanguageClassroomLanguageCode,
    )
  );
}

export function isLanguageClassroomAudioRequired(
  languageCode: LanguageClassroomLanguageCode,
): boolean {
  return getClassroomTargetLanguageCodes(languageCode).length > 0;
}

function hasAudioReadyStatus(localization: EpisodeLocalizationRow): boolean {
  return (
    localization.status === 'audio_generated' ||
    localization.status === 'completed'
  );
}

function isMainAudioReady(localization: EpisodeLocalizationRow): boolean {
  return (
    hasAudioReadyStatus(localization) && hasNonEmptyString(localization.hls_url)
  );
}

function isClassroomAudioReady(
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
): boolean {
  if (!isLanguageClassroomAudioRequired(languageCode)) {
    return true;
  }

  return hasNonEmptyString(localization.classroom_hls_url);
}

function hasNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function demoteIncompleteCompletedLocalization(
  localization: EpisodeLocalizationRow,
  mainAudioReady: boolean,
): Promise<EpisodeLocalizationRow> {
  const repairStatus = mainAudioReady
    ? ('audio_generated' as const)
    : ('script_generated' as const);
  const demotedLocalization = await step(
    `updateEpisodeLocalizationStatus:${repairStatus}`,
    () => updateEpisodeLocalizationStatus(localization.id, repairStatus),
  );

  if (!demotedLocalization) {
    throw new Error(
      'Failed to mark incomplete episode localization for audio repair',
    );
  }

  return demotedLocalization;
}

async function checkpointMainAudio(
  localization: EpisodeLocalizationRow,
  uploadedMain: UploadedAudioSection,
  languageCode: LanguageClassroomLanguageCode,
): Promise<EpisodeLocalizationRow> {
  const ttsMetadata = getTtsMetadataForLanguage(languageCode);
  const checkpoint = await step(
    'updateEpisodeLocalizationStatus:audio_generated:main',
    () =>
      updateEpisodeLocalizationStatus(localization.id, 'audio_generated', {
        hlsUrl: uploadedMain.hlsUrl,
        r2Prefix: uploadedMain.r2Prefix,
        ttsLanguageCode: ttsMetadata.languageCode,
        ttsVoiceName: ttsMetadata.voiceName,
      }),
  );

  if (!checkpoint || !hasNonEmptyString(checkpoint.hls_url)) {
    throw new Error('Failed to persist generated main audio');
  }

  return checkpoint;
}

async function checkpointClassroomAudio(
  localization: EpisodeLocalizationRow,
  uploadedClassroom: UploadedAudioSection,
  languageCode: LanguageClassroomLanguageCode,
): Promise<EpisodeLocalizationRow> {
  const checkpoint = await step(
    'updateEpisodeLocalizationStatus:audio_generated:classroom',
    () =>
      updateEpisodeLocalizationStatus(localization.id, 'audio_generated', {
        classroomHlsUrl: uploadedClassroom.hlsUrl,
        classroomR2Prefix: uploadedClassroom.r2Prefix,
      }),
  );

  if (!checkpoint) {
    throw new Error('Failed to persist generated language classroom audio');
  }
  assertRequiredAudioArtifacts(
    checkpoint.hls_url,
    checkpoint.classroom_hls_url,
    languageCode,
  );

  return checkpoint;
}

async function markLocalizationCompleted(
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
): Promise<EpisodeLocalizationRow> {
  assertRequiredAudioArtifacts(
    localization.hls_url,
    localization.classroom_hls_url,
    languageCode,
  );
  const completed = await step(
    'updateEpisodeLocalizationStatus:completed',
    () => updateEpisodeLocalizationStatus(localization.id, 'completed'),
  );

  if (completed?.status !== 'completed') {
    throw new Error('Failed to persist the completed audio status');
  }
  assertRequiredAudioArtifacts(
    completed.hls_url,
    completed.classroom_hls_url,
    languageCode,
  );
  return completed;
}

async function synthesizeAndUploadMainAudio(
  localization: EpisodeLocalizationRow,
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<UploadedAudioSection> {
  const mainAudio = await synthesizeMainAudio(
    localization.script ?? '',
    languageCode,
    costBreakdown,
  );
  return packageMainHls(mainAudio, episodeId, languageCode);
}

async function synthesizeAndUploadClassroomAudio(
  episodeId: string,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  classroomRows: LanguageClassroomRow[],
  costBreakdown: UsageCostLine[],
): Promise<UploadedAudioSection | null> {
  if (!isLanguageClassroomAudioRequired(languageCode)) {
    return null;
  }

  const readyRows = await ensureClassroomScripts(
    localization,
    languageCode,
    classroomRows,
    costBreakdown,
  );

  const perTargetAudios = await synthesizeUploadAndCheckpointClassroomAudios(
    episodeId,
    localization,
    languageCode,
    readyRows,
    costBreakdown,
  );

  const classroomAudio = await combineClassroomAudio(
    perTargetAudios,
    languageCode,
  );

  return packageAndUploadHls({
    audio: classroomAudio,
    episodeId,
    languageCode,
    section: 'classroom',
    generateStepName: 'generateClassroomHls',
    uploadStepName: 'uploadClassroomHlsToR2',
  });
}

/**
 * Backfills a blank-script target from the LLM before synthesis. A row with a
 * blank script only reaches here for episodes still mid-repair: the
 * presence-based missing-target guard in ensureLanguageClassrooms means a row
 * from a previously completed episode is never regenerated, so this can only
 * ever rewrite rows that were never fully published.
 */
async function ensureClassroomScripts(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  classroomRows: LanguageClassroomRow[],
  costBreakdown: UsageCostLine[],
): Promise<LanguageClassroomRow[]> {
  const blankScriptTargets = classroomRows
    .filter((row) => !hasNonEmptyString(row.script))
    .map((row) => row.target_language_code as LanguageClassroomLanguageCode);

  if (blankScriptTargets.length === 0) {
    return classroomRows;
  }

  const regenerated = await generateAndPersistLessons(
    localization,
    sourceLanguageCode,
    blankScriptTargets,
  );
  costBreakdown.push(...regenerated.cost);

  const regeneratedTargets = new Set(
    regenerated.rows.map((row) => row.target_language_code),
  );
  const retained = classroomRows.filter(
    (row) => !regeneratedTargets.has(row.target_language_code),
  );
  const merged = existingLanguageClassroomResult(
    [...retained, ...regenerated.rows],
    sourceLanguageCode,
    [],
  ).rows;

  const stillBlank = merged.filter((row) => !hasNonEmptyString(row.script));
  if (stillBlank.length > 0) {
    throw new Error(
      `Language classroom script generation incomplete for ${sourceLanguageCode}; missing scripts: ${stillBlank
        .map((row) => row.target_language_code)
        .join(', ')}`,
    );
  }

  return merged;
}

/**
 * Only reached for languages whose classroom audio is required. Each target's
 * HLS is checkpointed on its own language_classrooms row immediately after
 * upload (persist-before-advance), so a later target's failure still leaves
 * the earlier targets' audio durably recorded. A lesson that yields no audio
 * fails the ingest rather than shrinking the section.
 */
async function synthesizeUploadAndCheckpointClassroomAudios(
  episodeId: string,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  classroomRows: LanguageClassroomRow[],
  costBreakdown: UsageCostLine[],
): Promise<Buffer[]> {
  const audioBuffers: Buffer[] = [];

  for (const row of classroomRows) {
    const targetLanguageCode =
      row.target_language_code as LanguageClassroomLanguageCode;

    const result = await synthesizeClassroomAudio(row, { episodeId });
    costBreakdown.push(...result.cost);
    if (!result.audio) {
      throw new Error(
        `Language classroom audio synthesis failed for ${targetLanguageCode}`,
      );
    }
    audioBuffers.push(result.audio);

    const uploaded = await packageAndUploadHls({
      audio: result.audio,
      episodeId,
      languageCode,
      section: 'classroom',
      classroomTargetLanguageCode: targetLanguageCode,
      generateStepName: `generateClassroomHls:${targetLanguageCode}`,
      uploadStepName: `uploadClassroomHlsToR2:${targetLanguageCode}`,
    });
    if (!uploaded) {
      throw new Error(
        `Language classroom HLS was not produced for ${targetLanguageCode}`,
      );
    }

    await step(`updateLanguageClassroomAudio:${targetLanguageCode}`, () =>
      updateLanguageClassroomAudio(localization.id, targetLanguageCode, {
        hlsUrl: uploaded.hlsUrl,
        r2Prefix: uploaded.r2Prefix,
      }),
    );
  }

  return audioBuffers;
}

async function synthesizeMainAudio(
  script: string,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
): Promise<Buffer> {
  const mainAudio = await step('textToSpeech', () =>
    textToSpeech(cleanTextForTts(script), {
      languageCode,
      usage: 'main',
      costLabel: 'TTS main audio',
    }),
  );
  costBreakdown.push(...mainAudio.cost);
  return mainAudio.audio;
}

async function packageMainHls(
  audio: Buffer,
  episodeId: string,
  languageCode: LanguageClassroomLanguageCode,
): Promise<UploadedAudioSection> {
  return packageAndUploadHls({
    audio,
    episodeId,
    languageCode,
    section: 'main',
    generateStepName: 'generateMainHls',
    uploadStepName: 'uploadMainHlsToR2',
  });
}

/**
 * Only reached for languages whose classroom audio is required, so an empty
 * buffer list and a failed concat both fail the ingest.
 */
async function combineClassroomAudio(
  classroomAudios: Buffer[],
  languageCode: LanguageClassroomLanguageCode,
): Promise<Buffer> {
  if (classroomAudios.length === 0) {
    throw new Error(
      `Language classroom audio buffers are missing for ${languageCode}`,
    );
  }

  return step('concatEpisodeClassroomAudio', () =>
    concatMp3Buffers(classroomAudios),
  );
}

async function ensureLanguageClassrooms(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
): Promise<{ rows: LanguageClassroomRow[]; cost: UsageCostLine[] }> {
  let existing: LanguageClassroomRow[] = [];
  const cost: UsageCostLine[] = [];

  try {
    existing = await step('listLanguageClassroomsByLocalizationId', () =>
      listLanguageClassroomsByLocalizationId(localization.id),
    );

    const existingTargets = new Set(
      existing.map((row) => row.target_language_code),
    );
    const missingTargets = getClassroomTargetLanguageCodes(
      sourceLanguageCode,
    ).filter((targetLanguageCode) => !existingTargets.has(targetLanguageCode));

    if (missingTargets.length === 0) {
      logIngestSkip('language classrooms already ready');
      return existingLanguageClassroomResult(
        existing,
        sourceLanguageCode,
        cost,
      );
    }

    const generated = await generateAndPersistLessons(
      localization,
      sourceLanguageCode,
      missingTargets,
    );
    cost.push(...generated.cost);

    const persistedTargets = new Set(
      generated.rows.map((row) => row.target_language_code),
    );
    const retainedExisting = existing.filter(
      (row) => !persistedTargets.has(row.target_language_code),
    );

    return existingLanguageClassroomResult(
      [...retainedExisting, ...generated.rows],
      sourceLanguageCode,
      cost,
    );
  } catch (error) {
    logLanguageClassroomGenerationFailure(
      localization,
      sourceLanguageCode,
      error,
    );
    if (isLanguageClassroomAudioRequired(sourceLanguageCode)) {
      throw error;
    }
    return existingLanguageClassroomResult(existing, sourceLanguageCode, cost);
  }
}

/**
 * Generates lessons (content + the per-target narration script) via the LLM
 * and persists them. Shared by the missing-target path in
 * ensureLanguageClassrooms and the blank-script backfill in
 * ensureClassroomScripts so both stay in lockstep with the lesson shape.
 */
async function generateAndPersistLessons(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  targetLanguageCodes: LanguageClassroomLanguageCode[],
): Promise<{ rows: LanguageClassroomRow[]; cost: UsageCostLine[] }> {
  const cost: UsageCostLine[] = [];

  const generated = await step('generateLanguageClassrooms', () =>
    generateLanguageClassroomsWithLLM({
      title: localization.title,
      articleText: localization.raw_text ?? '',
      script: localization.script ?? '',
      sourceLanguageCode,
      targetLanguageCodes,
    }),
  );
  cost.push(
    buildLlmCostLine('LLM classrooms', {
      provider: generated.provider,
      model: generated.model,
      costUsd: generated.costUsd,
    }),
  );

  const persisted = await step('upsertLanguageClassrooms', () =>
    upsertLanguageClassrooms(
      generated.lessons.map((lesson) => ({
        id: randomUUID(),
        episodeLocalizationId: localization.id,
        sourceLanguageCode: lesson.sourceLanguageCode,
        targetLanguageCode: lesson.targetLanguageCode,
        oneLiner: lesson.oneLiner,
        keywords: lesson.keywords,
        llmModel: generated.model,
        llmThinkingModel: generated.thinkingModel,
        llmProvider: generated.provider,
        script: lesson.script,
      })),
    ),
  );

  return { rows: persisted, cost };
}

function assertLanguageClassroomsReady(
  classrooms: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
): void {
  if (!isLanguageClassroomAudioRequired(sourceLanguageCode)) {
    return;
  }

  const expectedTargets = getClassroomTargetLanguageCodes(sourceLanguageCode);
  const actualTargets = new Set(
    classrooms.map((classroom) => classroom.target_language_code),
  );
  const missingTargets = expectedTargets.filter(
    (targetLanguageCode) => !actualTargets.has(targetLanguageCode),
  );

  if (missingTargets.length > 0) {
    throw new Error(
      `Language classroom generation incomplete for ${sourceLanguageCode}; missing targets: ${missingTargets.join(', ')}`,
    );
  }
}

function assertRequiredAudioArtifacts(
  hlsUrl: string | null | undefined,
  classroomHlsUrl: string | null | undefined,
  languageCode: LanguageClassroomLanguageCode,
): void {
  if (!hasNonEmptyString(hlsUrl)) {
    throw new Error(`Main audio HLS was not produced for ${languageCode}`);
  }

  if (
    isLanguageClassroomAudioRequired(languageCode) &&
    !hasNonEmptyString(classroomHlsUrl)
  ) {
    throw new Error(
      `Language classroom HLS was not produced for ${languageCode}`,
    );
  }
}

function logLanguageClassroomGenerationFailure(
  localization: EpisodeLocalizationRow,
  sourceLanguageCode: LanguageClassroomLanguageCode,
  error: unknown,
): void {
  /* v8 ignore next -- @preserve */
  const err = error instanceof Error ? error : new Error(String(error));
  const details: Record<string, unknown> = {};
  details['episodeLocalizationId'] = localization.id;
  details['sourceLanguageCode'] = sourceLanguageCode;
  details['message'] = err.message;
  details['stack'] = err.stack;
  details['cause'] = err.cause;
  console.error('[/ingest] language classroom generation failed:', details);
}

function getTtsMetadataForLanguage(
  languageCode: LanguageClassroomLanguageCode,
): {
  languageCode: string;
  voiceName: string;
} {
  const metadata = getTtsMetadata({ languageCode, usage: 'main' });
  return {
    languageCode: metadata.languageCode,
    voiceName: metadata.voiceName,
  };
}
