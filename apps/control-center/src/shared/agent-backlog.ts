export type AgentBacklogItemStatus = 'ready' | 'working' | 'blocked';
export type AgentBacklogProviderStatus = 'ok' | 'unconfigured' | 'error';

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

export interface AgentBacklogReleaseInput {
  claimId: string;
  agentId: string;
  issueNumber: number;
  outcome: 'released' | 'blocked';
  reason: string;
}
