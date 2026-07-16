import { configureAppCoreEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

import { buildAppCoreEnvSource } from '@/config/appCoreEnv';
import { readExpoExtra } from '@/config/expoRuntimeConfig';

// Expo config `extra` is the runtime-safe fallback for values promoted from
// local VITE_* variables by app.config.ts. This keeps web, native, and desktop
// exports on the same app-core environment map.
configureAppCoreEnv(buildAppCoreEnvSource(readExpoExtra()));
