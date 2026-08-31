import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import type { SignalInspection } from '../services/operations/inspection/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import type { SentryResolutionResult } from '../services/operations/sentry-remediation.js';

/**
 * Narrow contract between MCP and the operational control plane. Read tools
 * consume normalized operations models; the sole mutation is an allowlisted
 * single-issue Sentry resolve operation.
 */
export interface OpsMcpOperations {
  getOperations(force?: boolean): Promise<OperationsResponse>;
  getSocial(force?: boolean): Promise<OperationsSocialResponse>;
  getCustomers(force?: boolean): Promise<CustomerEconomicsResponse>;
  inspectSignal(fingerprint: string): Promise<SignalInspection>;
  investigate(fingerprint: string, force?: boolean): Promise<IncidentPacket>;
  resolveSentryIssue(
    issueId: string,
    reason: string,
  ): Promise<SentryResolutionResult>;
}
