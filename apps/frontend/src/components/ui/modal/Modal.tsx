import { AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

import { ModalBackdrop } from './ModalBackdrop';
import type { ModalProps } from './types';

const MAX_WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
} as const;

export function Modal({
  isOpen,
  onClose,
  children,
  maxWidth = 'md',
  closeOnBackdropClick = true,
  className = '',
  unframed = false,
}: ModalProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (isOpen) {
        document.body.style.overflow = 'unset';
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass = MAX_WIDTH_CLASSES[maxWidth] ?? MAX_WIDTH_CLASSES.md;

  const frameClass = unframed
    ? ''
    : 'bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl';

  const handleDismiss = closeOnBackdropClick
    ? onClose
    : () => {
        // No-op when backdrop click is disabled
      };

  return (
    <AnimatePresence>
      <ModalBackdrop
        onDismiss={handleDismiss}
        innerClassName={`w-full ${maxWidthClass} ${frameClass} ${className}`}
      >
        {children}
      </ModalBackdrop>
    </AnimatePresence>
  );
}
