import type { ReactElement } from 'react';

import { isRuntimeMode } from '@/lib/env/runtimeEnv';
import { useAppSearchParams } from '@/lib/routing';
import { logger } from '@/utils';

import { BundlePageClient } from './BundlePageClient';
import { BundleProviders } from './BundleProviders';

export function BundlePageEntry(): ReactElement {
  const searchParams = useAppSearchParams();

  let userId = '';
  let walletId: string | null = null;
  let etlJobId: string | null = null;
  let isNewUser = false;
  try {
    userId = searchParams.get('userId') ?? '';
    walletId = searchParams.get('walletId');
    etlJobId = searchParams.get('etlJobId');
    isNewUser = searchParams.get('isNewUser') === 'true';
  } catch (error) {
    if (!isRuntimeMode('production')) {
      logger.error('Failed to read search params', error, 'BundlePageEntry');
    }
  }

  return (
    <BundleProviders>
      <BundlePageClient
        userId={userId}
        {...(walletId && { walletId })}
        {...(etlJobId && { etlJobId })}
        {...(isNewUser && { isNewUser: true })}
      />
    </BundleProviders>
  );
}
