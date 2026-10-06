import { useQuery } from '@tanstack/react-query';
import { nativeApplicationVersion } from 'expo-application';
import { checkForUpdate } from 'expo-in-app-updates';
import { storeUpdateActions } from './storeUpdateActions';
import { STORE_LINKS } from '@/config/storeLinks';
import type { AppUpdateView } from '@/integration/appUpdate';
export function useAppUpdate() {
  const query = useQuery({
    queryKey: ['play-store-update'],
    queryFn: checkForUpdate,
    staleTime: 21_600_000,
    retry: false,
  });
  const view: AppUpdateView = !nativeApplicationVersion
    ? { status: 'hidden' }
    : {
        currentVersion: nativeApplicationVersion,
        ...(query.isFetching
          ? { status: 'checking' }
          : query.isError
            ? { status: 'version-only' }
            : query.data?.updateAvailable
              ? { status: 'available' }
              : query.data
                ? { status: 'up-to-date' }
                : { status: 'version-only' }),
      };
  return {
    view,
    ...storeUpdateActions(STORE_LINKS.googlePlay, () => {
      void query.refetch();
    }),
  };
}
