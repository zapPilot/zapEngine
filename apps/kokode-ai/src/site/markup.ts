// Build-time HTML. Every interpolated value is escaped unless it is already
// Markup, so story copy can never inject tags. (Not named `html`: Prettier
// would reformat templates tagged that way as HTML.)

const ESCAPES: { readonly [char: string]: string } = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Escaped HTML; only `markup` and `lines` create it. */
export class Markup {
  constructor(readonly html: string) {}

  toString(): string {
    return this.html;
  }
}

export type Value =
  | Markup
  | string
  | number
  | false
  | null
  | undefined
  | readonly Value[];

function render(value: Value): string {
  if (value instanceof Markup) return value.html;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value === null || value === undefined) return '';
  return escape(String(value));
}

export function markup(
  strings: TemplateStringsArray,
  ...values: readonly Value[]
): Markup {
  let html = strings[0] ?? '';
  values.forEach((value, index) => {
    html += render(value) + (strings[index + 1] ?? '');
  });
  return new Markup(html);
}

/** One escaped line per entry, joined by line breaks. */
export function lines(texts: readonly string[]): Markup {
  return new Markup(texts.map(escape).join('<br />'));
}
