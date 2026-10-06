import { useQuery } from '@tanstack/react-query';
import { nativeApplicationVersion } from 'expo-application';
import { storeUpdateActions } from './storeUpdateActions';
import { STORE_LINKS } from '@/config/storeLinks';
import {
  appStoreIdFromUrl,
  fromStoreVersions,
  parseAppStoreLookup,
  type AppUpdateView,
} from '@/integration/appUpdate';
export function useAppUpdate() {
  const id = STORE_LINKS.appStore
    ? appStoreIdFromUrl(STORE_LINKS.appStore)
    : undefined;
  const query = useQuery({
    queryKey: ['app-store-version', id],
    enabled: Boolean(id),
    staleTime: 21_600_000,
    queryFn: async () => {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
      if (!response.ok) throw new Error('Store lookup failed');
      return parseAppStoreLookup(await response.json());
    },
  });
  const view: AppUpdateView =
    query.isFetching && nativeApplicationVersion
      ? { status: 'checking', currentVersion: nativeApplicationVersion }
      : fromStoreVersions(nativeApplicationVersion, query.data);
  return {
    view,
    ...storeUpdateActions(STORE_LINKS.appStore, () => {
      void query.refetch();
    }),
  };
}
