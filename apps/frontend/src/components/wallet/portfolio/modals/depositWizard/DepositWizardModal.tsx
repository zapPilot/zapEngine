import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { useWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import { BASE_USDC_ADDRESS } from '@zapengine/types/api';
import { type ReactElement, useState } from 'react';

import { Modal } from '@/components/ui/modal/Modal';
import { ModalContent } from '@/components/ui/modal/ModalContent';
import { ModalHeader } from '@/components/ui/modal/ModalHeader';

import { ConfigureStep } from './steps/ConfigureStep';
import { DoneStep } from './steps/DoneStep';
import { HyperliquidStep } from './steps/HyperliquidStep';
import { LegProgressList } from './steps/LegProgressList';
import { WizardStepper } from './WizardStepper';

interface DepositWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositWizardModal({
  isOpen,
  onClose,
}: DepositWizardModalProps): ReactElement | null {
  const { account } = useWalletProvider();
  const { wizard, pending, start, runHlpDeposit, retry, reset } =
    useDepositWizard();
  const [confirmClose, setConfirmClose] = useState(false);

  const inFlight =
    pending ||
    (wizard.stage !== 'configure' && wizard.stage !== 'done' && !wizard.error);

  const handleClose = (): void => {
    if (inFlight && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    onClose();
  };

  const handleFinish = (): void => {
    reset();
    onClose();
  };

  const sourceChainId = wizard.plan?.sourceChainId ?? 8453;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="lg"
      closeOnBackdropClick={false}
    >
      <ModalHeader title="One-click deposit" onClose={handleClose} />
      <ModalContent>
        <div className="space-y-4">
          <WizardStepper stage={wizard.stage} />

          {confirmClose && inFlight && (
            <div
              className="rounded-lg border border-amber-700 bg-amber-900/30 p-3 text-sm text-amber-200"
              data-testid="wizard-close-confirm"
            >
              Execution is still in progress. Your funds are safe on-chain, but
              closing hides the progress view.
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-amber-700 px-3 py-1 text-white"
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                >
                  Close anyway
                </button>
                <button
                  type="button"
                  className="rounded bg-gray-700 px-3 py-1 text-white"
                  onClick={() => setConfirmClose(false)}
                >
                  Keep watching
                </button>
              </div>
            </div>
          )}

          {wizard.error && (
            <div
              className="rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-300"
              data-testid="wizard-error"
            >
              {wizard.error.message}
              <button
                type="button"
                className="ml-3 rounded bg-red-700 px-2 py-0.5 text-xs text-white"
                onClick={retry}
              >
                Dismiss
              </button>
            </div>
          )}

          {wizard.stage === 'configure' && (
            <ConfigureStep
              pending={pending}
              onSubmit={(fromAmount) => {
                void (async () => {
                  try {
                    await start({
                      fromToken: BASE_USDC_ADDRESS as `0x${string}`,
                      fromAmount,
                    });
                  } catch {
                    // surfaced via wizard.error / lastError
                  }
                })();
              }}
            />
          )}

          {(wizard.stage === 'sourceExecution' ||
            wizard.stage === 'bridging') && (
            <LegProgressList legs={wizard.legs} sourceChainId={sourceChainId} />
          )}

          {wizard.stage === 'hyperliquidDeposit' && (
            <HyperliquidStep
              hlp={wizard.hlp}
              userAddress={account?.address}
              onDeposit={() => {
                void (async () => {
                  try {
                    await runHlpDeposit();
                  } catch {
                    // surfaced via wizard.error
                  }
                })();
              }}
            />
          )}

          {wizard.stage === 'done' && (
            <DoneStep
              legs={wizard.legs}
              hlp={wizard.hlp}
              sourceChainId={sourceChainId}
              onClose={handleFinish}
            />
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
