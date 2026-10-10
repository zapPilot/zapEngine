import { decisionPacketFromSuggestion } from './decisionPacketModel';
import { useReferenceStrategy } from './useReferenceStrategy';
import { useStrategySuggestion } from './useStrategySuggestion';
import { resolveVerdictSource } from './todayModel';
export function useTodayDecision({
  platformOS,
  isConnected,
  netWorth,
  netWorthLoading,
  userId,
}: {
  platformOS: string;
  isConnected: boolean;
  netWorth: number | null;
  /** A connected user's balance is still on its way; do not show the simulation first. */
  netWorthLoading: boolean;
  userId: string | null;
}) {
  const reference = useReferenceStrategy();
  const source = resolveVerdictSource({ platformOS, isConnected, netWorth });
  const personal = useStrategySuggestion(source === 'personal' ? userId : null);
  const query = source === 'personal' ? personal : reference;
  const pending =
    platformOS !== 'ios' && isConnected && netWorth === null && netWorthLoading;
  const suggestion = pending
    ? null
    : source === 'personal'
      ? (personal.data ?? null)
      : (reference.data?.suggestion ?? null);
  return {
    source,
    reference,
    suggestion,
    packet: suggestion ? decisionPacketFromSuggestion(suggestion) : null,
    isLoading: pending || query.isLoading,
    isError: !pending && query.isError,
    retry: () => void query.refetch(),
  };
}
