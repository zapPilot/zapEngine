import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface SocialLanguagePolicyEntry {
  language: SocialLanguageCode;
  activeSince: string;
  experimentKey?: string;
  experimentVariant?: string;
}

const MULTILINGUAL_ACTIVE_SINCE = '2026-08-24T00:00:00.000Z';

export const SOCIAL_LANGUAGE_POLICY = {
  rednote: [{ language: 'zh-Hant', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
  threads: [{ language: 'ja', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
  x: [
    {
      language: 'en',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'x-language-v1',
      experimentVariant: 'en',
    },
    {
      language: 'ja',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'x-language-v1',
      experimentVariant: 'ja',
    },
  ],
  youtube: [
    {
      language: 'en',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'youtube-language-cohort-v1',
      experimentVariant: 'en',
    },
    {
      language: 'ja',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'youtube-language-cohort-v1',
      experimentVariant: 'ja',
    },
  ],
} as const satisfies Record<
  SocialPlatform,
  readonly SocialLanguagePolicyEntry[]
>;

export function policyEntriesForLanguage(
  languageCode: SocialLanguageCode,
): { platform: SocialPlatform; policy: SocialLanguagePolicyEntry }[] {
  return (
    Object.entries(SOCIAL_LANGUAGE_POLICY) as [
      SocialPlatform,
      readonly SocialLanguagePolicyEntry[],
    ][]
  ).flatMap(([platform, entries]) =>
    entries
      .filter(({ language }) => language === languageCode)
      .map((policy) => ({ platform, policy })),
  );
}
