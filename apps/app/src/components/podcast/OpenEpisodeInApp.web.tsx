import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

// The device platform stays constant during this browser session.
function subscribeToDevice(): () => void {
  return () => undefined;
}

function isMobileDevice(): boolean {
  // iPadOS can advertise a desktop Mac user agent. Viewport width alone
  // must not select mobile; touch distinguishes these iPads from Macs.
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function serverDeviceSnapshot(): boolean {
  return false;
}

export function OpenEpisodeInApp({
  localizationId,
  languageCode,
}: {
  localizationId: string;
  languageCode: string;
}): ReactElement | null {
  const { t } = useContentLanguage();
  const mobile = useSyncExternalStore(
    subscribeToDevice,
    isMobileDevice,
    serverDeviceSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);

  if (!mobile || dismissed) return null;

  const appUrl = `zappilotv2://podcast/${encodeURIComponent(localizationId)}?lang=${encodeURIComponent(languageCode)}`;

  return (
    <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3 rounded-panel border border-rule bg-sheet p-3">
      <Text variant="label">{t('podcast.title')}</Text>
      <View className="flex-row flex-wrap items-center gap-3">
        <a
          href={appUrl}
          className="inline-flex min-h-control-md items-center rounded-control bg-ink px-3 py-2 font-text-semibold text-label text-ground"
        >
          {t('podcast.openInApp')}
        </a>
        <Tap
          accessibilityRole="button"
          onPress={() => setDismissed(true)}
          className="min-h-control-md justify-center rounded-control px-3 py-2"
        >
          <Text variant="label" tone="muted">
            {t('podcast.continueInBrowser')}
          </Text>
        </Tap>
      </View>
    </View>
  );
}
