import type {
  AgentBacklogClaimInput,
  AgentBacklogClaimResult,
  AgentBacklogCreateInput,
  AgentBacklogItem,
  AgentBacklogReleaseInput,
  AgentBacklogReleaseResult,
  AgentBacklogResponse,
} from '../../shared/agent-backlog.js';
import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
} from '../../shared/types.js';
import type { SentryInspectionOptions } from '../services/operations/inspection/sentry-options.js';
import type { SignalInspection } from '../services/operations/inspection/types.js';
import type { IncidentPacket } from '../services/operations/investigation.js';
import type { SentryResolutionResult } from '../services/operations/sentry-remediation.js';

/**
 * Narrow contract between MCP and the operational control plane. Read tools
 * consume normalized operations models; mutations stay explicitly allowlisted
 * to backlog lifecycle actions and single-issue Sentry resolution.
 */
export interface OpsMcpOperations {
  getOperations(force?: boolean): Promise<OperationsResponse>;
  getSocial(force?: boolean): Promise<OperationsSocialResponse>;
  getCustomers(force?: boolean): Promise<CustomerEconomicsResponse>;
  getBacklog(force?: boolean): Promise<AgentBacklogResponse>;
  createBacklogItem(input: AgentBacklogCreateInput): Promise<AgentBacklogItem>;
  claimBacklog(input: AgentBacklogClaimInput): Promise<AgentBacklogClaimResult>;
  releaseBacklog(
    input: AgentBacklogReleaseInput,
  ): Promise<AgentBacklogReleaseResult>;
  /** Compatibility only for older test fakes; no MCP tool calls this. */
  renewBacklog?: unknown;
  inspectSignal(
    fingerprint: string,
    sentry?: SentryInspectionOptions,
  ): Promise<SignalInspection>;
  investigate(fingerprint: string, force?: boolean): Promise<IncidentPacket>;
  resolveSentryIssue(
    issueId: string,
    reason: string,
  ): Promise<SentryResolutionResult>;
}
