import type { ReactElement } from 'react';
import { Callout } from './Callout';
import { TechnicalDetails } from './TechnicalDetails';
export function ErrorState({
  title,
  body,
  retryLabel,
  onRetry,
  isRetrying = false,
  details,
}: {
  title: string;
  body: string;
  retryLabel: string;
  onRetry: () => void;
  isRetrying?: boolean;
  details?: {
    label: string;
    message: string;
    copyLabel: string;
    onCopy: () => void;
  };
}): ReactElement {
  return (
    <Callout
      tone="danger"
      title={title}
      body={body}
      action={{
        label: retryLabel,
        accessibilityLabel: retryLabel,
        onPress: onRetry,
        loading: isRetrying,
      }}
    >
      {details ? <TechnicalDetails {...details} /> : null}
    </Callout>
  );
}
