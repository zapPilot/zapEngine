import type { CostHistoryResponse } from '../../shared/types.js';
import type { CostRepository } from './cost-repository.js';

export function loadCostHistory(input: {
  repository: CostRepository;
  now?: Date;
}): Promise<CostHistoryResponse> {
  return input.repository.loadHistory(input.now ?? new Date());
}
