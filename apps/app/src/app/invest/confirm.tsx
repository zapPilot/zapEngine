import type { ReactElement } from 'react';

import { Redirect } from 'expo-router';

export default function InvestConfirmRoute(): ReactElement {
  // Keep old deep links safe while the route and confirm steps are merged.
  return <Redirect href="/invest/route" />;
}
