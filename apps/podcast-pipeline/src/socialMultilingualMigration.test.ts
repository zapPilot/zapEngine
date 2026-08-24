import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_PRIMARY_LANGUAGE_CODES } from './types.js';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260824090000_social_multilingual_distribution.sql',
  ),
  'utf8',
);
const languageValues = SUPPORTED_PRIMARY_LANGUAGE_CODES.map(
  (language) => `'${language}'`,
).join(', ');

describe('multilingual social distribution migration', () => {
  it('uses the supported primary language list on every durable identity', () => {
    for (const constraint of [
      'social_publish_jobs_language_code_check',
      'social_posts_language_code_check',
      'social_strategy_versions_language_code_check',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `constraint ${constraint}\\s+check \\(language_code in \\(${languageValues}\\)\\)`,
          'i',
        ),
      );
    }
    expect(migration).toMatch(
      /unique \(episode_id, platform, language_code\)/i,
    );
    expect(migration).toMatch(/unique \(platform, language_code, version\)/i);
  });

  it('freezes experiment assignments and keeps them service-role-only', () => {
    expect(migration).toMatch(/primary key \(experiment_key, episode_id\)/i);
    expect(migration).toMatch(
      /alter table from_fed_to_chain\.social_experiment_assignments enable row level security/i,
    );
    expect(migration).toMatch(
      /for all to service_role\s+using \(true\)\s+with check \(true\)/i,
    );
  });

  it('appends language and immutable episode time to the candidate view', () => {
    expect(migration).toMatch(
      /select\s+video\.episode_id,[\s\S]+?as ready_at,\s+localization\.language_code,\s+episode\.created_at as episode_created_at/i,
    );
  });

  it('exposes only policy lanes that genuinely lack media, jobs, and posts', () => {
    expect(migration).toMatch(
      /create view from_fed_to_chain\.social_waiting_media/i,
    );
    expect(migration).toMatch(/and job\.id is null\s+and post\.id is null/i);
    expect(migration).toMatch(
      /policy\.experiment_key is null\s+or assignment\.variant = policy\.language_code/i,
    );
  });
});
