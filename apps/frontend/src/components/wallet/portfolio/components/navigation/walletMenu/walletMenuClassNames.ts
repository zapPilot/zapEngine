import type { CopyButtonVariant } from './types';

export function getCopyButtonClassName(variant: CopyButtonVariant): string {
  if (variant === 'text') {
    return 'text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors';
  }

  return 'text-xs text-gray-400 hover:text-purple-300 transition-colors';
}

export function getMenuButtonClassName(isConnecting: boolean): string {
  return `h-10 px-2 md:px-4 bg-gray-800/50 hover:bg-gray-800 border border-purple-500/20 hover:border-purple-500/40 rounded-lg transition-all duration-200 flex items-center gap-2 text-sm font-medium text-gray-200 hover:text-white ${
    isConnecting ? 'opacity-50 cursor-wait' : ''
  }`;
}

export function getChevronClassName(isMenuOpen: boolean): string {
  return `w-4 h-4 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`;
}
