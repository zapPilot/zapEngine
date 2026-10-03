import { toHex } from 'viem';
import { PUBLIC_RPCS } from '@/config/verifiable-strategy';
import type { CalculatorResult, Deployment } from './types';

export function reproductionCommands(
  result: CalculatorResult,
  deployment: Deployment,
) {
  return result.steps.map((step) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        { to: deployment.address, data: step.data },
        toHex(result.blockNumber),
      ],
    });
    return {
      name: step.name,
      payload,
      cast: `cast call ${deployment.address} --data ${step.data} --block ${result.blockNumber} --rpc-url ${PUBLIC_RPCS[0]}`,
      curl: `curl -s ${PUBLIC_RPCS[0]} -H 'Content-Type: application/json' --data '${payload}'`,
    };
  });
}
