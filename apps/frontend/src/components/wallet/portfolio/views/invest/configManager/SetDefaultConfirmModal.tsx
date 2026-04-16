import { type ReactElement } from "react";

import {
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/modal";

interface SetDefaultConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  currentDefaultName: string;
  targetConfigName: string;
}

/**
 * Confirmation modal for changing the default strategy configuration.
 *
 * @param props - Modal props including current and target config names
 * @returns Modal element
 */
export function SetDefaultConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  currentDefaultName,
  targetConfigName,
}: SetDefaultConfirmModalProps): ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <ModalHeader title="Change Default Configuration" onClose={onClose} />
      <ModalContent>
        <div className="space-y-4 text-sm text-gray-300">
          <p>
            This will change the default strategy configuration from{" "}
            <span className="font-semibold text-white">
              {currentDefaultName}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-white">{targetConfigName}</span>
            .
          </p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-amber-300 text-xs">
              This affects daily suggestions and backtesting defaults for all
              users. The previous default will remain available but will no
              longer be selected by default.
            </p>
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {isPending ? "Setting..." : "Confirm"}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
