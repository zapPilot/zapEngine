import { tokens } from '@zapengine/design-tokens/tokens';
import { LockKeyhole } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '@/components/ui/Tap';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useAppTabs } from './useAppTabs';
export interface BottomTabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}
export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { tabs, access } = useAppTabs();
  const { t } = useContentLanguage();
  return (
    <View
      className="shrink-0 border-t border-line bg-bg px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, tokens.radius.tile) }}
    >
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('tabs.bar')}
        className="w-full max-w-reading self-center flex-row"
      >
        {state.routes.map((route, index) => {
          const tab = tabs.find((item) => item.name === route.name);
          if (!tab) return null;
          const active = state.index === index;
          return (
            <Tap
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              aria-selected={active}
              accessibilityHint={tab.hint}
              feedback="highlight"
              className="min-h-hit flex-1 items-center justify-center gap-1 rounded-control py-2"
              onPress={() => {
                if (!tab.accessible) {
                  requestAccountConnection(access);
                  return;
                }
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
            >
              <View className="flex-row items-center gap-1">
                <Icon icon={tab.icon} tone={active ? 'accent' : 'muted'} />
                {!tab.accessible ? (
                  <Icon icon={LockKeyhole} size="xs" tone="muted" />
                ) : null}
              </View>
              <Text variant="overline" tone={active ? 'accent' : 'muted'}>
                {tab.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
