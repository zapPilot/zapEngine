/** SQL code for parity assertions, including PL/pgSQL bodies.
 * Preserve quoted values while discarding nested PostgreSQL comments.
 */
export function sqlCode(sql: string): string {
  let code = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index]!;

    if (char === "'" || char === '"') {
      const quoted = readQuoted(sql, index);
      code += quoted.value;
      index = quoted.next;
    } else if (sql.startsWith('--', index)) {
      index = skipLineComment(sql, index);
      code += ' ';
    } else if (sql.startsWith('/*', index)) {
      const comment = skipBlockComment(sql, index);
      code += `${comment.value} `;
      index = comment.next;
    } else {
      code += char;
      index++;
    }
  }

  return code;
}

function readQuoted(
  sql: string,
  start: number,
): { value: string; next: number } {
  const quote = sql[start]!;
  let value = quote;
  let index = start + 1;

  while (index < sql.length) {
    const char = sql[index++]!;
    value += char;

    if (char === quote) {
      if (sql[index] !== quote) {
        break;
      }
      value += sql[index++]!;
    } else if (char === '\\' && quote === "'" && index < sql.length) {
      value += sql[index++]!;
    }
  }

  return { value, next: index };
}

function skipLineComment(sql: string, start: number): number {
  let index = start;
  while (index < sql.length && sql[index] !== '\n') {
    index++;
  }
  return index;
}

function skipBlockComment(
  sql: string,
  start: number,
): { value: string; next: number } {
  let depth = 1;
  let index = start + 2;
  let value = '';

  while (index < sql.length && depth > 0) {
    if (sql.startsWith('/*', index)) {
      depth++;
      index += 2;
    } else if (sql.startsWith('*/', index)) {
      depth--;
      index += 2;
    } else {
      if (sql[index] === '\n') {
        value += '\n';
      }
      index++;
    }
  }

  return { value, next: index };
}
