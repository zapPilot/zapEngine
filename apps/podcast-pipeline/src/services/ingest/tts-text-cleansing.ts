const STANDALONE_HYPHEN_SEPARATOR = /^[\t ]*-{3,}[\t ]*$/;
const BLANK_LINE = /^[\t ]*$/;

export function cleanTextForTts(text: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (!lines.some((line) => STANDALONE_HYPHEN_SEPARATOR.test(line))) {
    return text;
  }

  for (
    let separatorIndex = lines.findIndex((line) =>
      STANDALONE_HYPHEN_SEPARATOR.test(line),
    );
    separatorIndex !== -1;
    separatorIndex = lines.findIndex((line) =>
      STANDALONE_HYPHEN_SEPARATOR.test(line),
    )
  ) {
    let start = separatorIndex;
    while (start > 0 && BLANK_LINE.test(lines[start - 1] ?? '')) {
      start -= 1;
    }

    let end = separatorIndex + 1;
    while (end < lines.length && BLANK_LINE.test(lines[end] ?? '')) {
      end += 1;
    }

    const separatesContent = start > 0 && end < lines.length;
    lines.splice(start, end - start, ...(separatesContent ? [''] : []));
  }

  return lines.join(newline);
}
