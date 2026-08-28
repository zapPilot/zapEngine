import type { SocialPlatform } from './platforms.js';
import type { SocialLanguageCode } from './types.js';

export interface SocialLanguagePolicyEntry {
  language: SocialLanguageCode;
  activeSince: string;
  experimentKey?: string;
  experimentVariant?: string;
  /**
   * How `experimentKey` gates inclusion. `exclusive` resolves a real
   * `social_experiment_assignments` row and only the assigned language's lane
   * is included. `always` means every language listed always ships together;
   * `experimentKey`/`experimentVariant` are then just a reporting label, and no
   * assignment row is created for them, so consumers must not expect one.
   */
  assignment?: 'exclusive' | 'always';
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
      assignment: 'exclusive',
    },
    {
      language: 'ja',
      activeSince: MULTILINGUAL_ACTIVE_SINCE,
      experimentKey: 'x-language-v1',
      experimentVariant: 'ja',
      assignment: 'exclusive',
    },
  ],
  // Assets may still exist in other languages, but distribution is deliberately
  // English-only until a YouTube language experiment is explicitly activated.
  youtube: [{ language: 'en', activeSince: MULTILINGUAL_ACTIVE_SINCE }],
} as const satisfies Record<
  SocialPlatform,
  readonly SocialLanguagePolicyEntry[]
>;
