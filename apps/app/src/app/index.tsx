import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { resolveLandingPath } from '@/integration/navigationModel';
import { useAccount } from '@/integration/useAccount';
import { loadSessionHint } from '@/storage/sessionHintStorage';
import { loadFirstRunSeen } from '@/storage/firstRunStorage';
import { BootScreen } from '@/components/shell/BootScreen';
export default function Index() {
  const router = useRouter();
  const account = useAccount();
  const [boot, setBoot] = useState<{ hint: boolean; seen: boolean } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadSessionHint(),
      Platform.OS === 'ios' ? Promise.resolve(true) : loadFirstRunSeen(),
    ]).then(([hint, seen]) => {
      if (active) setBoot({ hint, seen });
    });
    return () => {
      active = false;
    };
  }, []);
  const href = resolveLandingPath({
    platformOS: Platform.OS,
    hasBundleView: getBundleViewUserId() !== null,
    wasSignedIn: account.isConnected || boot?.hint === true,
    hasSeenFirstRun: boot?.seen === true,
  });
  useEffect(() => {
    if (boot !== null) router.replace(href);
  }, [router, href, boot]);
  return <BootScreen />;
}
