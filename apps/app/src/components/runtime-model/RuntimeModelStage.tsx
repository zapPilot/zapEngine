import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useReducedMotion } from '@/components/ui/useReducedMotion';
import type { TranslationKey } from '@/i18n/translations';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { RuntimeModelCanvas } from './RuntimeModelCanvas';
import {
  RUNTIME_MODEL_SPECS,
  type RuntimeModelVariant,
} from './runtimeModelSpec';

/**
 * App copy for the story pins each variant draws, keyed by story pin id.
 * First Run only reaches the three parts landing; Runtime draws no pins.
 */
const PIN_COPY: Record<
  RuntimeModelVariant,
  Readonly<Record<string, TranslationKey>>
> = {
  firstRun: {
    'your-strategy': 'runtime.strategy',
    'your-machine': 'runtime.machine',
    'your-wallet': 'runtime.wallet',
  },
  runtime: {},
};

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

export function RuntimeModelStage({
  variant,
}: {
  variant: RuntimeModelVariant;
}) {
  const spec = RUNTIME_MODEL_SPECS[variant];
  const { t } = useContentLanguage();
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  const active = useAppActive();
  const pinLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(PIN_COPY[variant]).map(([id, key]) => [id, t(key)]),
      ),
    [t, variant],
  );
  return (
    <View
      className="self-center overflow-hidden"
      style={{ width: spec.width, height: spec.height }}
    >
      <RuntimeModelCanvas
        spec={spec}
        pinLabels={pinLabels}
        reducedMotion={reducedMotion}
        paused={!focused || !active}
      />
    </View>
  );
}
