// Shared schema mirror of app/src/types/index.ts (keeps api decoupled but compatible)
export type RetryClass = 'replay' | 'bump' | 'rerun';
export type DecisionStateApp = 'LIVE' | 'SETTLED' | 'EXPIRED';
export type ResolutionSource = 'promise_callback' | 'status_read';
export type EventType =
  | 'run_started' | 'decision_created' | 'attempt_submitted' | 'consensus_waiting'
  | 'ack_swallowed' | 'retry_attempted' | 'retry_blocked' | 'decision_live'
  | 'decision_settled' | 'decision_expired' | 'fill' | 'metrics_tick' | 'run_finished';
export interface SimulationEvent {
  t: number;
  formattedTime: string;
  agent: 'unprotected' | 'oneshot' | 'proxy' | 'system';
  decision_id: string;
  type: EventType;
  data: {
    attempt?: number; class?: RetryClass; reason?: string;
    reserved?: number; ceiling?: number; via?: ResolutionSource;
    tx?: string; amount?: number; duplicate_fills?: number; damage?: number;
    in_air?: number; wallet_balance?: number; message?: string; finality_ms?: number;
  };
}
export type LatencyProfile = 'low' | 'medium' | 'high';
export interface SimulationConfig {
  swallowAck: boolean; resolutionDelay: number; retryCount: number;
  decisionSize: number; ceiling: number; isLiveMode: boolean;
  latencyProfile?: LatencyProfile;
}
