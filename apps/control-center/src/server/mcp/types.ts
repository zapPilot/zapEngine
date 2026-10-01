import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import type { OperationsGrowthResponse } from '../../shared/growth.js';
import type { SentryInspectionOptions } from '../services/operations/inspection/sentry-options.js';
import type { SignalInspection } from '../services/operations/inspection/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import type { SentryResolutionResult } from '../services/operations/sentry-remediation.js';

/**
 * Narrow contract between MCP and the operational control plane. Read tools
 * consume normalized operations models; the only mutation is single-issue
 * Sentry resolution.
 */
export interface OpsMcpOperations {
  getGrowth(force?: boolean): Promise<OperationsGrowthResponse>;
  getOperations(force?: boolean): Promise<OperationsResponse>;
  getSocial(force?: boolean): Promise<OperationsSocialResponse>;
  getCustomers(force?: boolean): Promise<CustomerEconomicsResponse>;
  inspectSignal(
    fingerprint: string,
    sentry?: SentryInspectionOptions,
  ): Promise<SignalInspection>;
  investigate(fingerprint: string, force?: boolean): Promise<IncidentPacket>;
  resolveSentryIssue(
    issueId: string,
    reason: string,
    delegatedBy?: string,
  ): Promise<SentryResolutionResult>;
}
