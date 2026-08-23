export const STRATEGY_DECISION_FOCUS_HREF = '/strategy?focus=decision' as const;

export function parseStrategyFocusParam(
  value: string | string[] | undefined,
): 'decision' | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'decision' ? 'decision' : null;
}
