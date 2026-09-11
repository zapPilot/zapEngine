export type AgentBacklogItemStatus = 'ready' | 'working' | 'blocked';
export type AgentBacklogProviderStatus = 'ok' | 'unconfigured' | 'error';
export type AgentBacklogMirrorStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export interface AgentBacklogClaim {
  claimId: string;
  issueNumber: number;
  agentId: string;
  claimedAt: string;
  leaseExpiresAt: string;
}

export interface AgentBacklogItem {
  issueNumber: number;
  title: string;
  body: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  area: string | null;
  risk: string | null;
  effort: string | null;
  status: AgentBacklogItemStatus;
  claim: AgentBacklogClaim | null;
}

export interface AgentBacklogResponse {
  generatedAt: string;
  status: AgentBacklogProviderStatus;
  message: string | null;
  repo: string;
  ready: number;
  working: number;
  blocked: number;
  completed7d: number;
  items: AgentBacklogItem[];
  /** True when a GitHub page limit was hit and some issues may be missing
   * from this snapshot; ordering/counts should not be trusted as exhaustive. */
  truncated: boolean;
}

export interface AgentBacklogCreateInput {
  title: string;
  problem: string;
  expectedOutcome: string;
  acceptanceCriteria: string[];
  area?: string | null;
  relevantFiles?: string[];
  outOfScope?: string[];
}

export interface AgentBacklogClaimInput {
  agentId: string;
  areas?: string[];
  leaseSeconds?: number;
}

export interface AgentBacklogClaimResult {
  claimed: boolean;
  reused: boolean;
  item: AgentBacklogItem | null;
  /** Best-effort GitHub visibility of the lease; the database claim above is
   * always the source of truth regardless of this value. */
  mirror: AgentBacklogMirrorStatus;
}

export interface AgentBacklogReleaseInput {
  claimId: string;
  agentId: string;
  issueNumber: number;
  outcome: 'released' | 'blocked';
  reason: string;
}

export interface AgentBacklogReleaseResult {
  released: boolean;
  alreadyReleased: boolean;
  mirror: AgentBacklogMirrorStatus;
}

export interface AgentBacklogRenewInput {
  claimId: string;
  agentId: string;
  leaseSeconds?: number;
}

export interface AgentBacklogRenewResult {
  renewed: boolean;
  leaseExpiresAt: string | null;
}
