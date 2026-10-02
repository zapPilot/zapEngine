import { describe, expect, it } from 'vitest';

import { sqlCode } from './__fixtures__/migrationSql.js';

describe('migration assertions use executable SQL', () => {
  it('cannot satisfy a missing gate using comments, including nested blocks', () => {
    const sql = sqlCode(
      '-- for update skip locked\nselect 1; /* gate /* nested */ still comment */',
    );
    expect(sql).toContain('select 1;');
    expect(sql).not.toMatch(/for update|gate|nested|comment/);
  });
  it('preserves strings, identifiers and function-body code', () => {
    const statement = `select '--value', 'it''s /* literal */', "--column";`;
    expect(sqlCode(statement)).toBe(statement);
    expect(sqlCode('as $$ begin -- fake gate\n perform 1; end; $$;')).toContain(
      'perform 1;',
    );
    expect(
      sqlCode('as $$ begin -- fake gate\n perform 1; end; $$;'),
    ).not.toContain('fake gate');
  });
});
