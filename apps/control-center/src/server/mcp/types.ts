import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import type { SignalInspection } from '../services/operations/inspection/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';

/**
 * Narrow contract between MCP and the operational read model. The protocol
 * layer is deliberately unable to reach provider adapters or raw databases.
 */
export interface OpsMcpOperations {
  getOperations(force?: boolean): Promise<OperationsResponse>;
  getSocial(force?: boolean): Promise<OperationsSocialResponse>;
  getCustomers(force?: boolean): Promise<CustomerEconomicsResponse>;
  inspectSignal(fingerprint: string): Promise<SignalInspection>;
  investigate(fingerprint: string, force?: boolean): Promise<IncidentPacket>;
}
