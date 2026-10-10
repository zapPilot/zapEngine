import { View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { Rail } from '@/components/ui/Rail';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { APP_ROUTES } from '@/integration/navigationModel';
import {
  DECISION_STEP_IDS,
  decisionStepCopy,
  decisionStepStatuses,
  type TodaySteps,
} from '@/integration/todayModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
/** The six steps as one row: where the decision stands, not a form to read. */
export function DecisionPipeline({ steps }: { steps: TodaySteps }) {
  const { t } = useContentLanguage();
  const statuses = decisionStepStatuses(steps);
  const copy = decisionStepCopy(steps);
  const line = (steps.observed ? [copy[1]!, copy[5]!] : [copy[0]!])
    .map((entry) => t(entry.key, entry.params))
    .join(' · ');
  return (
    <Link href={APP_ROUTES.decision} asChild>
      <Tap
        accessibilityRole="link"
        accessibilityLabel={t('today.steps')}
        className="gap-3 border-y border-rule py-4"
      >
        <View className="flex-row gap-2">
          {DECISION_STEP_IDS.map((id, index) => (
            <View key={id} className="min-w-0 flex-1 gap-2">
              <Rail status={statuses[index]!} />
              <View className="flex-row items-center gap-1">
                <StatusGlyph status={statuses[index]!} />
                <Text
                  variant="caption"
                  tone={statuses[index] === 'live' ? 'secondary' : 'muted'}
                  numberOfLines={1}
                >
                  {t(`today.step.${id}`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text variant="body-sm" tone="secondary">
          {line}
        </Text>
      </Tap>
    </Link>
  );
}
