import { tokens } from '@zapengine/design-tokens/tokens';
import { type Href, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { Tap } from '@/components/ui/Tap';

/** Circular header back button: pops the stack or falls back to a route. */
export function ScreenBackButton({ fallbackHref }: { fallbackHref: Href }) {
  const router = useRouter();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.05)]"
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(fallbackHref);
        }
      }}
    >
      <ArrowLeft size={17} strokeWidth={1.8} color={tokens.color['ink-dim']} />
    </Tap>
  );
}
