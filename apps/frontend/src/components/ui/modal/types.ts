export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  closeOnBackdropClick?: boolean;
  /**
   * Drop the default gray surface frame (bg/border/rounded/padding) so the
   * caller can supply its own container chrome. Width + positioning are kept.
   */
  unframed?: boolean;
}

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
}

export interface ModalContentProps {
  children: React.ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}
