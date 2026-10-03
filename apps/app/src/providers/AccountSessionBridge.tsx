import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import {
  configureAccountOwnerSession,
  type OwnerAuthOptions,
} from '@zapengine/app-core/lib/http/accountOwnerSession';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useToast } from '@zapengine/app-core/providers/ToastContext';
import {
  createAccountOwnerSession,
  reclaimAccountWallet,
  requestAccountAuthChallenge,
} from '@zapengine/app-core/services/accountAuthService';
import { useEffect, useRef, useState } from 'react';

import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { accountSessions } from '@/storage/accountSessions';

export function AccountSessionBridge() {
  const { t } = useContentLanguage();
  const wallet = useWalletProvider();
  const user = useUser();
  const { showToast } = useToast();
  const latest = useRef({ wallet, user, showToast, t });
  useEffect(() => {
    latest.current = { wallet, user, showToast, t };
  }, [wallet, user, showToast, t]);
  const inFlight = useRef(new Map<string, Promise<string | null>>());
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(
    () =>
      configureAccountOwnerSession({
        invalidate: (userId) => accountSessions.clear(userId),
        async getToken(options: OwnerAuthOptions) {
          const cached = await accountSessions.get(
            options.userId,
            options.recent,
          );
          if (cached) return cached.token;
          if (!options.interactive) return null;
          const running = inFlight.current.get(options.userId);
          if (running) return running;
          const task = (async () => {
            const current = latest.current;
            const address = current.wallet.account?.address;
            if (!address || current.user.userInfo?.userId !== options.userId)
              return null;
            const domain = new URL(getBundleShareOrigin()).host;
            const sign = async (purpose: 'session' | 'reclaim') => {
              const challenge = await requestAccountAuthChallenge({
                purpose,
                userId: options.userId,
                wallet: address,
                domain,
              });
              const signature = await current.wallet.signMessage(
                challenge.message,
              );
              return purpose === 'session'
                ? createAccountOwnerSession(challenge.challengeId, signature)
                : reclaimAccountWallet(challenge.challengeId, signature);
            };
            let session;
            try {
              session = await sign('session');
            } catch (error) {
              const reclaimable =
                error &&
                typeof error === 'object' &&
                'details' in error &&
                error.details &&
                typeof error.details === 'object' &&
                'canReclaim' in error.details &&
                error.details.canReclaim === true;
              if (!reclaimable) throw error;
              const accepted = await new Promise<boolean>((resolve) => {
                confirmRef.current = resolve;
                setConfirming(true);
              });
              if (!accepted) return null;
              session = await sign('reclaim');
            }
            if (latest.current.wallet.account?.address !== address) return null;
            await accountSessions.set(session.userId, {
              token: session.token,
              expiresAt: session.expiresAt,
              createdAt: new Date().toISOString(),
            });
            if (session.claimed)
              current.showToast({
                type: 'info',
                title: current.t('home.ownerClaimed'),
              });
            if (session.userId !== options.userId) {
              await current.user.refetch();
              return null;
            }
            return session.token;
          })();
          inFlight.current.set(options.userId, task);
          try {
            return await task;
          } finally {
            inFlight.current.delete(options.userId);
          }
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      confirmRef.current?.(false);
    },
    [],
  );
  const resolve = (accepted: boolean) => {
    confirmRef.current?.(accepted);
    confirmRef.current = null;
    setConfirming(false);
  };
  return (
    <ConfirmSheet
      visible={confirming}
      title={t('home.reclaimTitle')}
      body={t('home.reclaimBody')}
      confirmLabel={t('home.reclaimConfirm')}
      cancelLabel={t('home.cancel')}
      closeLabel={t('home.cancel')}
      onConfirm={() => resolve(true)}
      onClose={() => resolve(false)}
    />
  );
}
