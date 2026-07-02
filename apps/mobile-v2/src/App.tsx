import { PrivyProvider } from '@privy-io/expo';
import { StatusBar } from 'expo-status-bar';

import { getExpoMobileRuntimeConfig } from './config/expoRuntimeConfig';
import { StatusScreen } from './screens/StatusScreen';

export default function App() {
  const config = getExpoMobileRuntimeConfig();

  return (
    <>
      <StatusBar style="light" />
      {config.privy ? (
        <PrivyProvider
          appId={config.privy.appId}
          clientId={config.privy.clientId}
        >
          <StatusScreen
            body="Expo and Privy are wired for the v2 migration path."
            eyebrow="Zap Pilot"
            layout="home"
            title="Mobile portfolio control"
          />
        </PrivyProvider>
      ) : (
        <StatusScreen
          body="Privy mobile credentials are required for this build target."
          layout="centered"
          title="Zap Pilot Mobile"
        />
      )}
    </>
  );
}
