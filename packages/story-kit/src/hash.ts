export const slideHash = (index: number): string =>
  `#slide-${String(index + 1).padStart(2, '0')}`;
export function slideFromHash(hash: string, count: number): number | null {
  const match = /^#slide-(\d{2,})$/.exec(hash);
  if (!match) {
    return null;
  }
  const index = Number(match[1]) - 1;
  return index >= 0 && index < count ? index : null;
}
