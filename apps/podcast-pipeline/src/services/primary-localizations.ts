import {
  type EpisodeLocalizationRow,
  type LanguageClassroomLanguageCode,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';

export function orderedPrimaryLocalizations(
  localizations: readonly EpisodeLocalizationRow[],
): {
  languageCode: LanguageClassroomLanguageCode;
  localization: EpisodeLocalizationRow | undefined;
}[] {
  return SUPPORTED_PRIMARY_LANGUAGE_CODES.map((languageCode) => ({
    languageCode,
    localization: localizations.find(
      (candidate) => candidate.language_code === languageCode,
    ),
  }));
}
