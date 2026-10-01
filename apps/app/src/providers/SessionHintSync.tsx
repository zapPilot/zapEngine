import { useEffect, useRef } from 'react';
import { useAccount } from '@/integration/useAccount';
import { saveSessionHint } from '@/storage/sessionHintStorage';
export function SessionHintSync() {
  const { isConnected } = useAccount();
  const seenConnected = useRef(false);
  useEffect(() => {
    if (isConnected) {
      seenConnected.current = true;
      void saveSessionHint(true);
    } else if (seenConnected.current) {
      seenConnected.current = false;
      void saveSessionHint(false);
    }
  }, [isConnected]);
  return null;
}
