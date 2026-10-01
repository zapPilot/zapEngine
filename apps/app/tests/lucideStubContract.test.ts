import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { LUCIDE_ICON_NAMES } from './support/lucideStub';
it('covers every runtime lucide icon imported by app source', () => {
  const visit = (directory: string) => {
    for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, file.name);
      if (file.isDirectory()) {
        visit(filename);
        continue;
      }
      if (!/\.tsx?$/.test(filename)) continue;
      const source = ts.createSourceFile(
        filename,
        fs.readFileSync(filename, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of source.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.moduleSpecifier.text !== 'lucide-react-native' ||
          statement.importClause?.isTypeOnly
        )
          continue;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const specifier of bindings.elements) {
          if (specifier.isTypeOnly) continue;
          expect(LUCIDE_ICON_NAMES, filename).toContain(
            (specifier.propertyName ?? specifier.name).text,
          );
        }
      }
    }
  };
  visit(path.resolve('src'));
});
