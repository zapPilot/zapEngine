/** Footnote text with exactly one leading reference mark. */
export function formatFootnote(text: string): string {
  return text.charAt(0) === '※' ? text : `※${text}`;
}
