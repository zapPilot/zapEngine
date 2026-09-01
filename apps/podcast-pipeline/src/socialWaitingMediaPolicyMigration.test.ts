import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOCIAL_REQUIRED_ROTATION_LANGUAGES } from './social/language-allocation.js';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260901031500_social_language_v2_recovery_guards.sql',
  ),
  'utf8',
);

/**
 * `social_waiting_media` exists before an article has a release slot, while the
 * language-v2 lane shape is intentionally chosen from that future slot. The view
 * therefore reports episode-language readiness only; platform allocation belongs
 * to the selected release slot and durable publish jobs.
 */
describe('social language-v2 migration guards', () => {
  it('covers every language required by the rotating release cohort exactly once', () => {
    const readinessBlock = migration.slice(
      migration.indexOf('with required_language(language_code)'),
      migration.indexOf(')\nselect', migration.indexOf('with required_language')),
    );
    const languages = [
      ...readinessBlock.matchAll(/\('([^']+)'::text\)/gi),
    ].map(([, language]) => language);

    expect(new Set(languages)).toEqual(
      new Set(SOCIAL_REQUIRED_ROTATION_LANGUAGES),
    );
    expect(languages).toHaveLength(SOCIAL_REQUIRED_ROTATION_LANGUAGES.length);
  });

  it('models waiting media as pre-scheduling episode-language readiness', () => {
    const normalized = migration.toLowerCase();
    expect(normalized).toContain('cross join required_language');
    expect(normalized).toContain('localization.episode_id');
    expect(normalized).toContain('required_language.language_code');
    expect(normalized).toContain('null::text as platform');
    expect(normalized).toContain('null::text as experiment_key');
    expect(normalized).toContain("video.status <> 'completed'");
    expect(normalized).not.toContain('social_experiment_assignments');
  });

  it('stops reporting pre-scheduling readiness once an episode has durable release state', () => {
    expect(migration).toMatch(
      /not exists \([\s\S]*social_publish_jobs job[\s\S]*job\.episode_id = episode\.id[\s\S]*\)/i,
    );
    expect(migration).toMatch(
      /not exists \([\s\S]*social_posts post[\s\S]*post\.episode_id = episode\.id[\s\S]*\)/i,
    );
  });

  it('guards a legacy durable cohort from v2 lane insertion', () => {
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain_private\.guard_social_language_v2_generation/i,
    );
    expect(migration).toMatch(
      /x-language-v2[\s\S]*threads-language-v1[\s\S]*youtube-language-v1/i,
    );
    expect(migration).toMatch(
      /and exists \([\s\S]*social_publish_jobs existing[\s\S]*existing\.episode_id = new\.episode_id[\s\S]*\)/i,
    );
    expect(migration).toMatch(
      /and not exists \([\s\S]*existing\.experiment_key = any[\s\S]*\)[\s\S]*then[\s\S]*return null;/i,
    );
    expect(migration).toMatch(
      /before insert on from_fed_to_chain\.social_publish_jobs/i,
    );
  });

  it('runs in one transaction and reloads the PostgREST schema cache', () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/set local lock_timeout/i);
    expect(migration).toMatch(/set local statement_timeout/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration).toMatch(/^commit;/m);
  });

  it('does not rewrite existing publish jobs or posts', () => {
    expect(migration).not.toMatch(/update from_fed_to_chain\./i);
    expect(migration).not.toMatch(/\bdelete from\b/i);
  });
});
