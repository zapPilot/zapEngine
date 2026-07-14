import { tokens } from '@zapengine/design-tokens/tokens';
import {
  Activity,
  Headphones,
  House,
  Sparkles,
  User,
} from 'lucide-react-native';
import type { ComponentType, ReactElement } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui/Tap';
import {
  isTabAccessible,
  type AppTabName,
} from '@/integration/navigationModel';
import { useAccount } from '@/integration/useAccount';

type TabIcon = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

interface TabItem {
  name: string;
  label: string;
  Icon: TabIcon;
}

const TABS: readonly TabItem[] = [
  { name: 'home', label: 'Home', Icon: House },
  { name: 'strategy', label: 'Strategy', Icon: Sparkles },
  { name: 'podcast', label: 'Podcast', Icon: Headphones },
  { name: 'activity', label: 'Activity', Icon: Activity },
  { name: 'account', label: 'Account', Icon: User },
];

interface TabBarRoute {
  key: string;
  name: string;
}

interface BottomTabBarProps {
  state: {
    index: number;
    routes: TabBarRoute[];
  };
  navigation: {
    emit: (event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const TAB_BY_NAME = new Map(TABS.map((tab) => [tab.name, tab]));

export function BottomTabBar({
  state,
  navigation,
}: BottomTabBarProps): ReactElement {
  const insets = useSafeAreaInsets();
  const account = useAccount();

  return (
    <View
      className="flex-row shrink-0 border-t border-line px-1.5 pt-3"
      style={{
        backgroundColor: 'rgba(10,10,10,.85)',
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TAB_BY_NAME.get(route.name);
        if (!tab) return null;

        const active = state.index === index;
        const accessible = isTabAccessible(
          route.name as AppTabName,
          account.isConnected,
        );
        const color = active ? tokens.color.accent : tokens.color['ink-faint'];
        const Icon = tab.Icon;

        return (
          <Tap
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            aria-selected={active}
            accessibilityHint={
              accessible ? undefined : 'Open this tab to continue with Privy'
            }
            className="flex-1 items-center gap-1.5"
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!active && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            <Icon size={22} strokeWidth={1.7} color={color} />
            <Text
              className={
                active
                  ? 'font-sans-semibold text-[10px] text-accent'
                  : 'font-sans text-[10px] text-ink-faint'
              }
            >
              {tab.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
