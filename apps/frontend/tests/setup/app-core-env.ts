import { configureAppCoreEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

// Mirror the app bootstrap (src/bootstrap/appCoreEnv.ts): app-core reads env
// through this injected map, and passing the live import.meta.env object lets
// tests that stub keys on it keep working.
configureAppCoreEnv(import.meta.env);
