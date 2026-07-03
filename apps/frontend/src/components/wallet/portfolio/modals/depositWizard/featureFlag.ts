import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';

/**
 * The wizard ships dark behind VITE_ENABLE_DEPOSIT_WIZARD=1 until the
 * HyperCore route is opened via DEPOSIT_DEFAULT_SPLIT on the backend.
 */
export function isDepositWizardEnabled(): boolean {
  return getRuntimeEnv('VITE_ENABLE_DEPOSIT_WIZARD') === '1';
}
