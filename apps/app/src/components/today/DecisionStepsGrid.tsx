import { View } from 'react-native';
import { Link } from 'expo-router';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { Rail } from '@/components/ui/Rail';
import { SegmentRail } from '@/components/ui/SegmentRail';
import { APP_ROUTES } from '@/integration/navigationModel';
import {
  DECISION_STEP_IDS,
  decisionStepCopy,
  decisionStepStatuses,
  todaySteps,
} from '@/integration/todayModel';
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
  const copy = decisionStepCopy(steps);
  const statuses = decisionStepStatuses(steps);
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
              <Text variant="body-sm">
                {t(copy[index]!.key, copy[index]!.params)}
              </Text>
              <Rail status={statuses[index]!} />
            </View>
          ))}
        </View>
      </Tap>
    </Link>
  );
}
