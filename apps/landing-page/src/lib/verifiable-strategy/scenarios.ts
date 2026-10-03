import { formatUnits } from 'viem';
import { decimalToWad, epochDay, inputFromExample } from './encoding';
import type { Example } from './types';

export const SCENARIOS = [
  { id: 'real', label: 'Real data' },
  { id: 'above', label: 'BTC holds above its average' },
  { id: 'cooldown', label: 'Exit rule cooling down' },
  { id: 'touch', label: 'BTC closes on its average' },
] as const;
export type Scenario = (typeof SCENARIOS)[number]['id'];
export function scenarioInput(example: Example, scenario: Scenario) {
  const input = inputFromExample(example);
  const btc = input.current[1]!;
  if (scenario === 'above')
    btc.price = formatUnits((decimalToWad(btc.dma) * 101n) / 100n, 18);
  if (scenario === 'touch') btc.price = btc.dma;
  if (scenario === 'cooldown')
    input.lastExecutedDay = epochDay(input.date) - 10;
  return input;
}
