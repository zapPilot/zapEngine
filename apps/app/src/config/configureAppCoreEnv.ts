import { configureAppCoreEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

import { buildAppCoreEnvSource } from '@/config/appCoreEnv';
import { readExpoExtra } from '@/config/expoRuntimeConfig';

// Expo config `extra` is the runtime-safe fallback for canonical values
// projected by app.config.ts. Every host still injects app-core's VITE_* map.
configureAppCoreEnv(buildAppCoreEnvSource(readExpoExtra()));
