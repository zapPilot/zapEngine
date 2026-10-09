import { decisionPacketFromSuggestion } from './decisionPacketModel';
import { useReferenceStrategy } from './useReferenceStrategy';
import { useStrategySuggestion } from './useStrategySuggestion';
import { resolveVerdictSource } from './todayModel';
export function useTodayDecision({
  platformOS,
  isConnected,
  netWorth,
  userId,
}: {
  platformOS: string;
  isConnected: boolean;
  netWorth: number | null;
  userId: string | null;
}) {
  const reference = useReferenceStrategy();
  const source = resolveVerdictSource({ platformOS, isConnected, netWorth });
  const personal = useStrategySuggestion(source === 'personal' ? userId : null);
  const query = source === 'personal' ? personal : reference;
  const suggestion =
    source === 'personal'
      ? (personal.data ?? null)
      : (reference.data?.suggestion ?? null);
  return {
    source,
    reference,
    suggestion,
    packet: suggestion ? decisionPacketFromSuggestion(suggestion) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}
