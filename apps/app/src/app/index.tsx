import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';

export default function Index(): ReactElement {
  return <Redirect href={DEFAULT_APP_TAB_PATH} />;
}
