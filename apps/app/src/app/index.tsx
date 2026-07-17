import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';

export default function Index(): ReactElement {
  // A shared `?userId=` bundle link should land on that bundle's portfolio,
  // not the default Podcast tab.
  const href = getBundleViewUserId() !== null ? '/home' : DEFAULT_APP_TAB_PATH;
  return <Redirect href={href} />;
}
