import { Link } from 'expo-router';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function RebalancePlanCard({
  suggestion,
}: {
  suggestion: DailySuggestionResponse | null;
}) {
  const { t } = useContentLanguage();
  if (!suggestion || suggestion.action.transfers.length === 0) return null;
  const status = CAPABILITY_STATUS['rebalance-plans'];
  return (
    <Card variant="pending" padding="md" className="gap-3">
      <Badge status={status}>{t(`status.${status}`)}</Badge>
      <Text variant="heading">{t('today.planTitle')}</Text>
      <Text variant="caption" tone="secondary">
        {t('today.plannedBody')}
      </Text>
      <Link href={APP_ROUTES.decision} asChild>
        <Tap
          accessibilityRole="link"
          accessibilityLabel={t('today.openDecision')}
          className="py-2"
        >
          <Text variant="action" tone="sign">
            {t('today.openDecision')}
          </Text>
        </Tap>
      </Link>
    </Card>
  );
}
