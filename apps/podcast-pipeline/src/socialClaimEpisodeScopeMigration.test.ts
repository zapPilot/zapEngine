import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const migration = fs.readFileSync(
  path.join(
    repoRoot,
    'supabase/migrations/20260826120000_claim_social_publish_batch_episode_scope.sql',
  ),
  'utf8',
);

describe('claim_social_publish_batch episode-scope migration', () => {
  it('drops the two-argument overload before recreating the function', () => {
    expect(migration).toMatch(
      /drop function if exists from_fed_to_chain\.claim_social_publish_batch\(text, timestamptz\);/i,
    );
    expect(migration).toMatch(
      /create or replace function from_fed_to_chain\.claim_social_publish_batch\(/i,
    );
  });

  it('adds an optional episode filter that defaults to unrestricted', () => {
    expect(migration).toMatch(/p_episode_id uuid default null/i);
    expect(migration).toMatch(
      /and \(p_episode_id is null or job\.episode_id = p_episode_id\)/i,
    );
  });

  it('still claims one article batch atomically with skip locked and an expiring lease', () => {
    expect(migration).toMatch(/seed_episode_id/i);
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).toMatch(
      /lease_expires_at = p_now \+ interval '60 minutes'/i,
    );
    expect(migration).toMatch(/attempt_count = job\.attempt_count \+ 1/i);
    expect(migration).toMatch(/job\.episode_id = seed_episode_id/i);
    expect(migration).toMatch(/job\.attempt_count < 8/i);
  });

  it('grants and revokes execute on the new three-argument signature', () => {
    expect(migration).toMatch(
      /grant execute on function from_fed_to_chain\.claim_social_publish_batch\(text, timestamptz, uuid\) to service_role;/i,
    );
    expect(migration).toMatch(
      /revoke execute on function from_fed_to_chain\.claim_social_publish_batch\(text, timestamptz, uuid\)\s+from public, anon, authenticated;/i,
    );
  });
});
