import {
  type EpisodeLocalizationRow,
  type EpisodeResponse,
  type EpisodeRow,
  type LanguageClassroomLanguageCode,
  type LanguageClassroomRow,
} from '../../types.js';
import {
  buildUsageCostDetails,
  type UsageCostDetails,
  type UsageCostLine,
} from '../cost.js';
import { toEpisodeResponseFromLocalization } from '../db.js';
import { getClassroomTargetLanguageCodes } from './classroom-config.js';

export interface IngestResult {
  episode: EpisodeResponse;
  statusCode: 200 | 201;
  costUsd: number;
  costDetails: UsageCostDetails;
}

type EnsureLocalizationCompleted = (
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  costBreakdown: UsageCostLine[],
) => Promise<{
  localization: EpisodeLocalizationRow;
  classroomRows: LanguageClassroomRow[];
}>;

export async function completeIngestResult(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  languageCode: LanguageClassroomLanguageCode,
  statusCode: 200 | 201,
  costBreakdown: UsageCostLine[],
  ensureCompleted: EnsureLocalizationCompleted,
): Promise<IngestResult> {
  const completed = await ensureCompleted(
    episode,
    localization,
    languageCode,
    costBreakdown,
  );

  return buildIngestResult(
    episode,
    completed.localization,
    completed.classroomRows,
    statusCode,
    costBreakdown,
  );
}

export function buildIngestResult(
  episode: EpisodeRow,
  localization: EpisodeLocalizationRow,
  classrooms: LanguageClassroomRow[],
  statusCode: 200 | 201,
  costBreakdown: UsageCostLine[],
): IngestResult {
  const costDetails = buildUsageCostDetails(costBreakdown);

  return {
    episode: toEpisodeResponseFromLocalization(
      episode,
      localization,
      classrooms,
    ),
    statusCode,
    costUsd: costDetails.totalUsd,
    costDetails,
  };
}

export function existingLanguageClassroomResult(
  existing: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
  cost: UsageCostLine[],
): { rows: LanguageClassroomRow[]; cost: UsageCostLine[] } {
  return {
    rows: orderLanguageClassrooms(existing, sourceLanguageCode),
    cost,
  };
}

function orderLanguageClassrooms(
  rows: LanguageClassroomRow[],
  sourceLanguageCode: LanguageClassroomLanguageCode,
): LanguageClassroomRow[] {
  const order = new Map(
    getClassroomTargetLanguageCodes(sourceLanguageCode).map(
      (languageCode, index) => [languageCode, index],
    ),
  );

  return [...rows].sort(
    (a, b) =>
      (order.get(a.target_language_code as LanguageClassroomLanguageCode) ??
        Number.MAX_SAFE_INTEGER) -
      (order.get(b.target_language_code as LanguageClassroomLanguageCode) ??
        Number.MAX_SAFE_INTEGER),
  );
}
