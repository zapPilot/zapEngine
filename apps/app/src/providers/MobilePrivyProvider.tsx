import { PrivyProvider } from '@privy-io/expo';
import type { ReactElement, ReactNode } from 'react';

import { NATIVE_PRIVY_PROVIDER_CONFIG } from '@/integration/nativePrivyLogin';

export function MobilePrivyProvider({
  appId,
  clientId,
  supportedChains,
  children,
}: {
  appId: string;
  clientId: string;
  supportedChains?: React.ComponentProps<
    typeof PrivyProvider
  >['supportedChains'];
  children: ReactNode;
}): ReactElement {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={NATIVE_PRIVY_PROVIDER_CONFIG}
      {...(supportedChains === undefined ? {} : { supportedChains })}
    >
      {children}
    </PrivyProvider>
  );
}
