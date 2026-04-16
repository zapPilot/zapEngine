export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  closeOnBackdropClick?: boolean;
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
