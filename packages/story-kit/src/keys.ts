export type DeckCommand = 'prev' | 'next' | 'toggle' | 'first' | 'last';
export function deckCommand(key: string): DeckCommand | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'prev';
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      return 'next';
    case ' ':
      return 'toggle';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}
