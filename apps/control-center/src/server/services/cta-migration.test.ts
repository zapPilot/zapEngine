import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('migrates historical signups without broadening access and preserves idempotent first-touch experiment attribution', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE TABLE waitlist_signups (email text primary key, created_at timestamptz default now()); INSERT INTO waitlist_signups(email) VALUES ('historical@example.com');`,
    );
    await db.exec(
      await readFile(
        new URL(
          '../../../../../supabase/migrations/20261003010000_waitlist_cta_experiment.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(
      (
        await db.query<{ cta_exposure_id: string | null }>(
          'SELECT cta_exposure_id FROM waitlist_signups',
        )
      ).rows[0]?.cta_exposure_id,
    ).toBeNull();
    await db.exec(
      `INSERT INTO waitlist_signups(email,cta_experiment_key,cta_experiment_variant,cta_exposure_id) VALUES ('new@example.com','landing-waitlist-cta-v1','control','12345678-1234-4234-8234-123456789012');`,
    );
    await db.exec(
      `INSERT INTO waitlist_signups(email,cta_experiment_key,cta_experiment_variant,cta_exposure_id) VALUES ('new@example.com','landing-waitlist-cta-v1','value_first','87654321-4321-4321-8321-210987654321') ON CONFLICT(email) DO NOTHING;`,
    );
    expect(
      (
        await db.query<{ cta_experiment_variant: string }>(
          "SELECT cta_experiment_variant FROM waitlist_signups WHERE email='new@example.com'",
        )
      ).rows[0]?.cta_experiment_variant,
    ).toBe('control');
    await expect(
      db.exec(
        `INSERT INTO waitlist_signups(email,cta_experiment_key) VALUES ('partial@example.com','landing-waitlist-cta-v1')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO waitlist_signups(email,cta_experiment_key,cta_experiment_variant,cta_exposure_id) VALUES ('invalid@example.com','unknown','winner','12345678-1234-4234-8234-123456789012')`,
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
