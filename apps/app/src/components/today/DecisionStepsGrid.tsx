import { View } from 'react-native';
import { Link } from 'expo-router';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { Rail } from '@/components/ui/Rail';
import { SegmentRail } from '@/components/ui/SegmentRail';
import { APP_ROUTES } from '@/integration/navigationModel';
import { DECISION_STEP_IDS, todaySteps } from '@/integration/todayModel';
import type { SignRequest } from '@/integration/fundFlowModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function DecisionStepsGrid({
  suggestion,
  rules,
  signRequest,
}: {
  suggestion: DailySuggestionResponse | null;
  rules: readonly { name: string; number: number }[];
  signRequest: SignRequest | null;
}) {
  const { t } = useContentLanguage();
  const steps = todaySteps(suggestion, rules, signRequest);
  const values = [
    steps.observed ? t('today.signalsRead') : t('today.waitingReason'),
    steps.evaluated
      ? t('today.firedCount', { fired: steps.fired, count: steps.ruleCount })
      : t('decision.ruleStatus.unavailable'),
    steps.targetChanged ? t('today.targetUpdated') : t('today.unchanged'),
    t(`status.${steps.planStatus}`),
    steps.checkPending ? t('today.pending') : t('today.idle'),
    steps.signPending ? t('today.signWaiting') : t('today.nothingToSign'),
  ];
  const statuses = DECISION_STEP_IDS.map((id) =>
    id === 'plan'
      ? steps.planStatus
      : suggestion !== null && id !== 'check' && id !== 'sign'
        ? ('live' as const)
        : ('planned' as const),
  );
  return (
    <Link href={APP_ROUTES.decision} asChild>
      <Tap
        accessibilityRole="link"
        accessibilityLabel={t('today.steps')}
        className="gap-4 border-y border-rule py-4"
      >
        <SegmentRail
          statuses={statuses}
          accessibilityLabel={t('today.steps')}
        />
        <View className="flex-row flex-wrap">
          {DECISION_STEP_IDS.map((id, index) => (
            <View key={id} className="w-1/2 gap-2 p-2">
              <Text variant="label" tone="muted">
                {t(`today.step.${id}`)}
              </Text>
              <Text variant="body-sm">{values[index]}</Text>
              <Rail status={statuses[index]!} />
            </View>
          ))}
        </View>
      </Tap>
    </Link>
  );
}
