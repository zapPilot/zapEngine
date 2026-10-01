import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { resolveLandingPath } from '@/integration/navigationModel';
import { useAccount } from '@/integration/useAccount';
import { loadSessionHint } from '@/storage/sessionHintStorage';
import { BootScreen } from '@/components/shell/BootScreen';
export default function Index() {
  const router = useRouter();
  const account = useAccount();
  const [hint, setHint] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void loadSessionHint().then((value) => {
      if (active) setHint(value);
    });
    return () => {
      active = false;
    };
  }, []);
  const href = resolveLandingPath({
    platformOS: Platform.OS,
    hasBundleView: getBundleViewUserId() !== null,
    wasSignedIn: account.isConnected || hint === true,
  });
  useEffect(() => {
    if (hint !== null) router.replace(href);
  }, [router, href, hint]);
  return <BootScreen />;
}
