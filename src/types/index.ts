export type RetryClass = 'replay' | 'bump' | 'rerun';

export type DecisionState = 'LIVE' | 'SETTLED' | 'EXPIRED';

export type ResolutionSource = 'promise_callback' | 'status_read';

export interface DecisionIdentity {
  id: string; // Hash e.g. 0x9f3a...c21e
  agentAccount: string; // e.g. agent-arbitrage.near
  asset: string; // e.g. NEAR/USDC
  size: number; // e.g. 500
  direction: 'BUY' | 'SELL';
  slippageTolerance: number; // e.g. 0.005 (0.5%)
  expirySec: number;
}

export type EventType =
  | 'run_started'
  | 'decision_created'
  | 'attempt_submitted'
  | 'consensus_waiting'
  | 'ack_swallowed'
  | 'retry_attempted'
  | 'retry_blocked'
  | 'decision_live'
  | 'decision_settled'
  | 'decision_expired'
  | 'fill'
  | 'metrics_tick'
  | 'run_finished';

export interface SimulationEvent {
  t: number; // seconds relative to start e.g. 0.4
  formattedTime: string; // e.g. [00:00.400]
  agent: 'unprotected' | 'oneshot' | 'proxy' | 'system';
  decision_id: string;
  type: EventType;
  data: {
    attempt?: number;
    class?: RetryClass;
    reason?: string;
    reserved?: number;
    ceiling?: number;
    via?: ResolutionSource;
    tx?: string;
    amount?: number;
    duplicate_fills?: number;
    damage?: number;
    in_air?: number;
    wallet_balance?: number;
    message?: string;
    finality_ms?: number;
  };
}

export interface SimulationConfig {
  swallowAck: boolean;
  resolutionDelay: number; // 3, 8, 15, 30
  retryCount: number; // 3, 5, 8
  decisionSize: number; // 100, 500, 1000
  ceiling: number; // e.g. decisionSize (or 500 standard)
  isLiveMode: boolean; // true = Live WebSocket / simulated live API, false = Replay recorded run
}

export interface AgentRunState {
  walletBalance: number;
  initialBalance: number;
  duplicateFills: number;
  damage: number;
  inAir: number;
  status: 'IDLE' | 'WAITING_CONSENSUS' | 'RUNNING' | 'FINISHED';
  consensusStatus: 'IDLE' | 'WAITING' | 'FINALIZED';
  currentDecisionState: DecisionState | 'NONE';
  attempts: Array<{
    attemptNumber: number;
    timestamp: number;
    status: 'SUBMITTED' | 'WAITING_CONSENSUS' | 'FILLED' | 'BLOCKED';
    class?: RetryClass;
    tx?: string;
    reason?: string;
  }>;
  resolutionVia?: ResolutionSource;
  resolutionTx?: string;
  events: SimulationEvent[];
}

export interface OnChainTx {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: string;
  decisionId: string;
  agent: 'oneshot' | 'unprotected' | 'proxy';
  method: 'execute_decision' | 'promise_callback' | 'guard_block' | 'direct_swap';
  venue: string;
  status: 'SETTLED' | 'LIVE' | 'BLOCKED' | 'DUPLICATE_FILL';
  amount: number;
  gasBurntTgas: number;
  details: string;
}

