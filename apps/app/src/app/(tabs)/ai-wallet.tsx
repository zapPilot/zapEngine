import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

export default function AiWalletRoute(): ReactElement {
  return <Redirect href="/podcast" />;
}
