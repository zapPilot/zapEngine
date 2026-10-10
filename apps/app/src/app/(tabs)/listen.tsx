import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { ListenScreen } from '@/screens/ListenScreen';

export default function PodcastRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="listen">
      <ListenScreen />
    </ScreenCrashBoundary>
  );
}
