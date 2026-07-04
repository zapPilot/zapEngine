import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

export default function InvestIndexRoute(): ReactElement {
  return <Redirect href="/invest/amount" />;
}
