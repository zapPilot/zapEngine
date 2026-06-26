import type { ModalType } from '@zapengine/app-core/types/portfolio';
import { useState } from 'react';

/**
 * Custom hook for managing portfolio modal state.
 * Consolidates modal and settings panel state management.
 */
export function usePortfolioModalState() {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openModal = (type: ModalType | null) => {
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const openSettings = () => {
    setIsSettingsOpen(true);
  };

  return {
    activeModal,
    isSettingsOpen,
    openModal,
    closeModal,
    openSettings,
    setIsSettingsOpen,
  };
}
