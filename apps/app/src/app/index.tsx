import { useRouter } from 'expo-router';
import { useEffect, type ReactElement } from 'react';

import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';

export default function Index(): ReactElement | null {
  const router = useRouter();
  const href = getBundleViewUserId() !== null ? '/home' : DEFAULT_APP_TAB_PATH;

  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return null;
}
