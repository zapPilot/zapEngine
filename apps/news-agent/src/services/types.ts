import type { PlanOrchestrationDepositReviewResponse } from '@zapengine/types/api';

import type { SigningPayload } from '../lib/multibaas.js';

export interface Episode {
  id: string;
  title: string;
  raw_text: string;
  source_url: string;
}
export interface Step {
  status: 'submitting' | 'submitted' | 'confirmed' | 'failed';
  nonce: number;
  to: string;
  value: string;
  dataHash: string;
  payload: SigningPayload;
  hash?: string;
  outcome?: string;
}
export interface Action {
  id: string;
  episode_id: string;
  rule_version: string;
  status:
    | 'pending'
    | 'skipped'
    | 'approved'
    | 'blocked'
    | 'submitting'
    | 'submitted'
    | 'confirmed'
    | 'failed'
    | 'needs_attention';
  decision: {
    model: string;
    evidence: string;
    rationale: string;
    action: unknown;
  } | null;
  review: PlanOrchestrationDepositReviewResponse | null;
  steps: Step[];
  wallet_address: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface Store {
  discover: (since: string, episode?: string) => Promise<Episode[]>;
  episode: (id: string) => Promise<Episode>;
  insert: (episode: string, rule: string) => Promise<void>;
  list: (
    statuses: Action['status'][],
    rule?: string,
    limit?: number,
    unnotified?: boolean,
  ) => Promise<Action[]>;
  cas: (action: Action, patch: Partial<Action>) => Promise<Action | null>;
  notificationContext: (episode: string) => Promise<{
    videoStatus: string | null;
    videoChat: string | null;
    ingestChat: string | null;
  }>;
}
