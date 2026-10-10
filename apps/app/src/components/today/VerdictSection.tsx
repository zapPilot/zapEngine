import { Link } from 'expo-router';
import { View } from 'react-native';
import { humanizeSlug } from '@zapengine/types/shared';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { Text } from '@/components/ui/Text';
import { KineticText } from '@/components/ui/KineticText';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { formatSnapshotDate } from '@/lib/portfolioDates';
import { APP_ROUTES } from '@/integration/navigationModel';
import {
  verdictFromSuggestion,
  type VerdictSource,
} from '@/integration/todayModel';
import {
  ruleNumberFromReason,
  ruleNameFromReason,
} from '@/integration/referenceStrategyModel';
import { RULE_LABEL_KEYS } from '@/integration/decisionTraceModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function VerdictSection({
  suggestion,
  source,
  rules,
  loading,
  error,
  retry,
}: {
  suggestion: DailySuggestionResponse | null;
  source: VerdictSource;
  rules: readonly { name: string; number: number }[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}) {
  const { t, languageCode } = useContentLanguage();
  const date = formatSnapshotDate(suggestion?.as_of, languageCode);
  const verdict = verdictFromSuggestion(suggestion);
  const number = suggestion
    ? ruleNumberFromReason(suggestion.action.reason_code, rules)
    : null;
  const ruleName = suggestion
    ? ruleNameFromReason(suggestion.action.reason_code)
    : null;
  const key = ruleName ? RULE_LABEL_KEYS[ruleName] : undefined;
  const kicker =
    number !== null && key
      ? t('today.ruleKicker', { number, name: t(key) })
      : t(`today.${source}`);
  const reason =
    suggestion === null
      ? t('today.waitingReason')
      : number !== null
        ? t('today.ruleReason')
        : verdict === 'hold' &&
            suggestion.action.reason_code === 'regime_no_signal'
          ? t('today.holdReason')
          : t('today.reasonCode', {
              reason: humanizeSlug(
                suggestion.action.reason_code,
                {},
                suggestion.action.reason_code,
              ),
            });
  return (
    <View className="gap-3 pt-5">
      {date ? (
        <Text variant="label" tone="muted">
          {date}
        </Text>
      ) : null}
      <Text variant="label" tone="muted">
        {kicker}
      </Text>
      {loading && suggestion === null ? (
        <SkeletonBlock className="h-16 rounded-panel" />
      ) : (
        <KineticText variant="verdict" heading={2}>
          {t(`today.verdict.${verdict}`)}
        </KineticText>
      )}
      <Text tone="secondary">{reason}</Text>
      {error ? (
        <Button variant="secondary" onPress={retry}>
          {t('common.retry')}
        </Button>
      ) : null}
      <Link href={APP_ROUTES.decision} asChild>
        <Tap
          accessibilityRole="link"
          accessibilityLabel={t('today.openDecision')}
          className="self-start py-2"
        >
          <Text variant="action" tone="sign">
            {t('today.openDecision')}
          </Text>
        </Tap>
      </Link>
    </View>
  );
}
