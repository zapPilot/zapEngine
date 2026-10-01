import { useRouter } from 'expo-router';
import { en as tabsEn } from '@/i18n/modules/tabs';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';

import { Button } from '@/components/ui/Button';
import { ZapLogo } from '@/components/ui/ZapLogo';

/**
 * Full-screen notice layout. Exported so the shell's config notice and the
 * crash fallback below cannot visually drift apart — they are the same screen
 * with different copy, and duplicating the layout would make them drift.
 */
export function IconNoticeScreen({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-control border border-line bg-surface">
        <ZapLogo size={24} />
      </View>
      <Text variant="title-sm" heading={1} className="text-center">
        {title}
      </Text>
      <Text variant="body-sm" tone="secondary" className="mt-3 text-center">
        {body}
      </Text>
      {children}
    </View>
  );
}

/**
 * Rendered by every error boundary in the app — the root shell one and the
 * per-screen ones. The "Something went wrong" copy is load-bearing: the web
 * e2e smoke suite treats it as its crashed-app signal, so a screen-level crash
 * stays visible to smoke instead of silently passing behind new wording.
 */
export function CrashFallbackScreen({
  resetError,
}: {
  resetError: () => void;
}): ReactElement {
  const router = useRouter();
  return (
    <IconNoticeScreen
      title="Something went wrong"
      body="The app hit an unexpected error. Try again, or restart the app if it keeps happening."
    >
      <Button className="mt-6" onPress={resetError}>
        Try again
      </Button>
      <Button
        className="mt-3"
        variant="ghost"
        onPress={() => router.replace('/home')}
      >
        {tabsEn['tabs.home']}
      </Button>
    </IconNoticeScreen>
  );
}
