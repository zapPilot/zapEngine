import {
  COVERAGE_EXCLUDED_EMPTY_MODULES,
  COVERAGE_EXCLUDED_TYPE_ONLY_MODULES,
} from '../../coverage-exclusions';
import fs from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../../', import.meta.url);

function parse(relativePath: string): ts.SourceFile {
  const absolutePath = new URL(relativePath, packageRoot);
  const source = fs.readFileSync(absolutePath, 'utf8');

  return ts.createSourceFile(
    absolutePath.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function isEmptyModuleStatement(statement: ts.Statement): boolean {
  return (
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier === undefined &&
    statement.exportClause !== undefined &&
    ts.isNamedExports(statement.exportClause) &&
    statement.exportClause.elements.length === 0
  );
}

function isTypeOnlyStatement(statement: ts.Statement): boolean {
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEmptyStatement(statement)
  ) {
    return true;
  }

  if (ts.isImportDeclaration(statement)) {
    return statement.importClause?.isTypeOnly === true;
  }

  return ts.isExportDeclaration(statement) && statement.isTypeOnly;
}

describe('coverage exclusions', () => {
  // Invariant: an excluded empty module stays exactly `export {}`; adding
  // re-exports, initialization or any other statement makes this test fail.
  it.each(COVERAGE_EXCLUDED_EMPTY_MODULES)(
    '%s contains only an empty export declaration',
    (relativePath) => {
      const sourceFile = parse(relativePath);

      expect(sourceFile.statements).toHaveLength(1);
      expect(sourceFile.statements.every(isEmptyModuleStatement)).toBe(true);
    },
  );

  // Invariant: every excluded type module erases completely during TypeScript
  // compilation; schemas, constants, enums and side effects remain covered.
  it.each(COVERAGE_EXCLUDED_TYPE_ONLY_MODULES)(
    '%s contains only type-erased declarations',
    (relativePath) => {
      const sourceFile = parse(relativePath);

      expect(sourceFile.statements.length).toBeGreaterThan(0);
      expect(sourceFile.statements.every(isTypeOnlyStatement)).toBe(true);
    },
  );
});
