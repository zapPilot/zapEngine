import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOCIAL_REQUIRED_ROTATION_LANGUAGES } from './social/language-allocation.js';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260828143000_social_youtube_english_only_waiting_media.sql',
  ),
  'utf8',
);

/**
 * `social_waiting_media` exists before an article has a release slot, while the
 * language-v2 lane shape is intentionally chosen from that future slot. The view
 * therefore cannot mirror the final platform-language matrix anymore. Its only
 * release-blocking responsibility is to surface every language whose completed
 * video may be required by the cohort-wide readiness barrier.
 */
describe('social waiting-media readiness migration', () => {
  it('covers every language required by the rotating release cohort', () => {
    const policyBlock = migration.slice(
      migration.indexOf('with policy('),
      migration.indexOf(')\nselect'),
    );
    const languages = new Set(
      [...policyBlock.matchAll(/'[^']+',\s*'([^']+)'/gi)].map(
        ([, language]) => language,
      ),
    );

    for (const language of SOCIAL_REQUIRED_ROTATION_LANGUAGES) {
      expect(languages.has(language)).toBe(true);
    }
  });

  it('is consumed as an episode-language readiness signal, not a future lane assignment', () => {
    expect(migration).toMatch(/select\s+[\s\S]*localization\.episode_id/i);
    expect(migration).toMatch(/policy\.language_code/i);
    expect(migration).toMatch(/video\.status <> 'completed'/i);
  });

  it('runs in one transaction and reloads the PostgREST schema cache', () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/set local lock_timeout/i);
    expect(migration).toMatch(/set local statement_timeout/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration).toMatch(/^commit;/m);
  });

  it('changes nothing but the view', () => {
    expect(migration).not.toMatch(/update from_fed_to_chain\./i);
    expect(migration).not.toMatch(/create or replace function/i);
    expect(migration).not.toMatch(/\bdelete from\b/i);
  });
});
