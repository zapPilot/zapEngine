import { Loader2, Wallet } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { type Connector, useConnect, useConnectors } from 'wagmi';

import { Modal, ModalContent, ModalHeader } from '@/components/ui/modal';
import { WALLET_LABELS } from '@/constants/wallet';
import { extractErrorMessage } from '@/lib/errors';

interface WalletPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getVisibleConnectors(connectors: readonly Connector[]): Connector[] {
  const hasEip6963Connectors = connectors.some(
    (connector) => connector.id !== 'injected',
  );

  return hasEip6963Connectors
    ? connectors.filter((connector) => connector.id !== 'injected')
    : [...connectors];
}

function getConnectorUid(connector: unknown): string | undefined {
  if (
    connector &&
    typeof connector === 'object' &&
    'uid' in connector &&
    typeof connector.uid === 'string'
  ) {
    return connector.uid;
  }

  return undefined;
}

export function WalletPickerModal({
  isOpen,
  onClose,
}: WalletPickerModalProps): ReactElement {
  const connectors = useConnectors();
  const visibleConnectors = useMemo(
    () => getVisibleConnectors(connectors),
    [connectors],
  );
  const {
    error,
    isPending,
    mutateAsync: connectAsync,
    variables,
  } = useConnect();
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setInlineError(null);
    }
  }, [isOpen]);

  const activeConnectorUid = getConnectorUid(variables?.connector);
  const errorMessage = inlineError ?? error?.message ?? null;

  const handleSelectConnector = async (connector: Connector): Promise<void> => {
    setInlineError(null);

    try {
      await connectAsync({ connector });
      onClose();
    } catch (caughtError) {
      setInlineError(
        extractErrorMessage(caughtError, 'Failed to connect wallet'),
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <ModalHeader
        title={WALLET_LABELS.SELECT_WALLET_TITLE}
        subtitle={WALLET_LABELS.SELECT_WALLET_SUBTITLE}
        onClose={onClose}
      />
      <ModalContent className="pt-2">
        {visibleConnectors.length > 0 ? (
          <div className="space-y-3">
            {visibleConnectors.map((connector) => {
              const isActiveConnector =
                isPending && activeConnectorUid === connector.uid;

              return (
                <button
                  key={connector.uid}
                  type="button"
                  onClick={() => {
                    void handleSelectConnector(connector);
                  }}
                  disabled={isPending}
                  aria-busy={isActiveConnector}
                  className="w-full flex items-center gap-4 rounded-xl border border-gray-700/50 bg-gray-800/50 px-4 py-3 text-left transition-colors hover:bg-gray-700/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {connector.icon ? (
                    <img
                      src={connector.icon}
                      alt={`${connector.name} icon`}
                      className="h-8 w-8 rounded-lg"
                      loading="lazy"
                    />
                  ) : (
                    <Wallet className="h-8 w-8 text-purple-400" />
                  )}
                  <span className="flex-1 font-semibold text-white">
                    {connector.name}
                  </span>
                  {isActiveConnector && (
                    <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-4">
            <p className="font-semibold text-white">
              {WALLET_LABELS.NO_WALLET_DETECTED}
            </p>
            <p className="mt-2 text-sm text-gray-400">
              {WALLET_LABELS.INSTALL_WALLET_CTA}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-purple-500/40 px-3 py-2 text-sm font-semibold text-purple-300 transition-colors hover:bg-purple-500/10"
              >
                MetaMask
              </a>
              <a
                href="https://rabby.io/"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-purple-500/40 px-3 py-2 text-sm font-semibold text-purple-300 transition-colors hover:bg-purple-500/10"
              >
                Rabby
              </a>
            </div>
          </div>
        )}

        {errorMessage && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        )}
      </ModalContent>
    </Modal>
  );
}
