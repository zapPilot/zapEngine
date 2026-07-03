// Must stay the first import: injects env into app-core before any of its
// modules evaluate.
import './config/appCoreEnv';

import { PrivyProvider } from '@privy-io/expo';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { StatusBar } from 'expo-status-bar';

import { getExpoMobileRuntimeConfig } from './config/expoRuntimeConfig';
import { StatusScreen } from './screens/StatusScreen';

export default function App() {
  const config = getExpoMobileRuntimeConfig();

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
