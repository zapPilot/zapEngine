export type AgentBacklogItemStatus = 'ready' | 'working' | 'blocked';
export type AgentBacklogProviderStatus = 'ok' | 'unconfigured' | 'error';

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
  fingerprint: string | null;
  status: AgentBacklogItemStatus;
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
  effort?: 'xs' | 's' | 'm' | null;
  fingerprint?: string;
  relevantFiles?: string[];
  outOfScope?: string[];
}

export interface AgentBacklogClaimInput {
  agentId: string;
  areas?: string[];
}

export interface AgentBacklogClaimResult {
  claimed: boolean;
  item: AgentBacklogItem | null;
}

export interface AgentBacklogReleaseInput {
  agentId: string;
  issueNumber: number;
  outcome: 'released' | 'blocked' | 'already-fixed';
  evidence?: { commitSha?: string; prNumber?: number };
  reason: string;
}

export interface AgentBacklogReleaseResult {
  released: boolean;
  outcome: AgentBacklogReleaseInput['outcome'];
  closed: boolean;
  verification: string | null;
}

export interface AgentBacklogCreateResult {
  created: boolean;
  item: AgentBacklogItem;
}
