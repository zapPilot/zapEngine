import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOCIAL_LANGUAGE_POLICY } from './social/policy.js';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260828143000_social_youtube_english_only_waiting_media.sql',
  ),
  'utf8',
);

/**
 * `social_waiting_media` holds a second copy of the language policy that
 * `policy.ts` owns, because a view cannot import TypeScript. This test is the
 * only thing keeping the two honest: a lane retired in code but left in the
 * view keeps reporting media the pipeline is no longer waiting for.
 */
describe('social waiting-media policy migration', () => {
  const policyRows = Object.entries(SOCIAL_LANGUAGE_POLICY).flatMap(
    ([platform, entries]) =>
      entries.map((entry) => ({ platform, language: entry.language })),
  );

  it.each(policyRows)(
    'lists the $platform/$language lane the code policy ships',
    ({ platform, language }) => {
      expect(migration).toMatch(
        new RegExp(`'${platform}'[^\\n]*,\\s*'${language}'`, 'i'),
      );
    },
  );

  it('does not distribute YouTube in any language but English', () => {
    const policyBlock = migration.slice(
      migration.indexOf('with policy('),
      migration.indexOf(')\nselect'),
    );
    const youtubeLanguages = [
      ...policyBlock.matchAll(/'youtube',\s*'([^']+)'/gi),
    ].map(([, language]) => language);
    expect(youtubeLanguages).toEqual(['en']);
  });

  it('runs in one transaction and reloads the PostgREST schema cache', () => {
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/set local lock_timeout/i);
    expect(migration).toMatch(/set local statement_timeout/i);
    expect(migration).toMatch(/notify pgrst, 'reload schema';/i);
    expect(migration).toMatch(/^commit;/m);
  });

  it('changes nothing but the view', () => {
    // Retired strategy rows are deactivated by the next refresh, and no queued
    // job is rewritten: completing a row that never published would put a post
    // that does not exist into the success counts.
    expect(migration).not.toMatch(/update from_fed_to_chain\./i);
    expect(migration).not.toMatch(/create or replace function/i);
    expect(migration).not.toMatch(/\bdelete from\b/i);
  });
});
