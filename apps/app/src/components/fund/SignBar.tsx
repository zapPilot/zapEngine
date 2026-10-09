import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import type { SignRequest } from '@/integration/fundFlowModel';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/cn';
export function SignBar({ layout = 'bar' }: { layout?: 'bar' | 'card' }) {
  const fund = useFundFlow();
  if (!fund.available || fund.signRequest === null) return null;
  const requestKey = `${fund.signRequest.kind}:${fund.signRequest.expiresAt}`;
  return (
    <SignBarRequest
      key={requestKey}
      request={fund.signRequest}
      layout={layout}
      open={fund.open}
    />
  );
}
function SignBarRequest({
  request,
  layout,
  open,
}: {
  request: SignRequest;
  layout: 'bar' | 'card';
  open: () => void;
}) {
  const { t } = useContentLanguage();
  const expiresAt = request.expiresAt;
  const [expired, setExpired] = useState(
    () => expiresAt === null || expiresAt <= Date.now(),
  );
  useEffect(() => {
    if (expiresAt === null) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setExpired(true), delay);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const checked = request.kind !== 'agent' && expiresAt !== null && !expired;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={t('dock.open')}
      feedback="highlight"
      onPress={open}
      className={cn(
        'min-h-control-lg flex-row items-center gap-3 border border-rule bg-ground px-4 py-3',
        layout === 'card' ? 'rounded-panel' : 'border-x-0',
      )}
    >
      <StatusGlyph status={checked ? 'live' : 'planned'} />
      <View className="flex-1 gap-1">
        <Text variant="body-sm">
          {t(`dock.${request.kind}`, { amount: formatUsd(request.amountUsd) })}
        </Text>
        <Text variant="label" tone="muted">
          {request.kind === 'agent'
            ? t('dock.authorize')
            : checked
              ? t('dock.checked')
              : t('dock.recheck')}
        </Text>
      </View>
      <Text variant="label">{t('dock.open')}</Text>
    </Tap>
  );
}
