import { WALLET_LABELS } from '@/constants/wallet';

interface ActionLabelConfig {
  isConnected: boolean;
  isReady: boolean;
  readyLabel: string;
  notReadyLabel: string;
  hasSelection?: boolean;
  selectionLabel?: string;
}

export function resolveActionLabel({
  isConnected,
  isReady,
  readyLabel,
  notReadyLabel,
  hasSelection = true,
  selectionLabel = notReadyLabel,
}: ActionLabelConfig): string {
  if (!isConnected) {
    return WALLET_LABELS.CREATE_ZAP_WALLET;
  }

  if (!hasSelection) {
    return selectionLabel;
  }

  if (!isReady) {
    return notReadyLabel;
  }

  return readyLabel;
}
