import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { cn } from '@/lib/cn';
import { useAppTabs } from './useAppTabs';
import { TabGlyph } from './TabGlyph';
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
  const { tabs } = useAppTabs();
  const { t } = useContentLanguage();
  return (
    <View
      className="shrink-0 border-t border-rule bg-ground"
      style={{ paddingBottom: insets.bottom }}
    >
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('tabs.bar')}
        className="h-control-lg w-full max-w-reading self-center flex-row"
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
              feedback="highlight"
              className="relative flex-1 items-center justify-center gap-1"
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
            >
              <View
                className={cn(
                  'absolute inset-x-0 top-0 h-0.5',
                  active ? 'bg-ink' : 'bg-transparent',
                )}
              />
              <TabGlyph name={tab.name} active={active} />
              <Text variant="label" tone={active ? 'default' : 'muted'}>
                {tab.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
