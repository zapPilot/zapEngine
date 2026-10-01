import { RefreshCw } from 'lucide-react-native';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
export function PortfolioImportState({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return retryLabel && onRetry ? (
    <ErrorState
      title={title}
      body={body}
      retryLabel={retryLabel}
      onRetry={onRetry}
    />
  ) : (
    <EmptyState icon={RefreshCw} title={title} body={body} />
  );
}
