export function createStrategyStartAction(
  runAuthenticated: (action: () => void) => void,
  navigateToInvest: () => void,
): () => void {
  return () => runAuthenticated(navigateToInvest);
}
