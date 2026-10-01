import { tokens } from '@zapengine/design-tokens/tokens';
export type PageWidth = 'dashboard' | 'reading' | 'narrow' | 'full';
export function breakpointForWidth(
  width: number,
): 'compact' | 'medium' | 'expanded' {
  if (width >= tokens.breakpoint.expanded) return 'expanded';
  return width >= tokens.breakpoint.medium ? 'medium' : 'compact';
}
export function pageGutter(width: number): number {
  return tokens.gutter[breakpointForWidth(width)];
}
export function contentWidthFor(width: number, page: PageWidth): number {
  const available = Math.max(0, width - pageGutter(width) * 2);
  return page === 'full'
    ? available
    : Math.min(available, tokens.container[page]);
}
export function columnCountFor(width: number): 1 | 2 {
  return width >= tokens.breakpoint.medium ? 2 : 1;
}
