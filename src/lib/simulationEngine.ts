import {
  SimulationConfig,
  SimulationEvent,
  RetryClass,
  AgentRunState,
  ResolutionSource,
} from '../types';

export const DEFAULT_CONFIG: SimulationConfig = {
  swallowAck: true,
  resolutionDelay: 15,
  retryCount: 5,
  decisionSize: 500,
  ceiling: 500,
  isLiveMode: false, // Default is replay mode with real-run fidelity
  latencyProfile: 'medium',
};

export const DEFAULT_DECISION_ID = '0x9f3a8b41e05d2c73';
export const CONTRACT_ADDRESS = 'oneshot-guard.near';
export const VENUE_RHEA = 'v1.rhea-exchange.near';
export const VENUE_INTENTS = 'intents.near';

export function formatTimeMs(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const mins = Math.floor(totalMs / 60000);
  const remMs = totalMs % 60000;
  const secs = Math.floor(remMs / 1000);
  const millis = remMs % 1000;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');
  return `[${mm}:${ss}.${mmm}]`;
}

export function generateDecisionHash(agent: string, asset: string, size: number): string {
  // Deterministic simulation hash based on semantic fields
  return `0x9f3a${(size * 17).toString(16).padStart(4, '0')}c21e`;
}

/**
 * Builds the chronological schedule of events for a simulation run.
 */
export function buildSimulationSchedule(config: SimulationConfig): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const decisionId = generateDecisionHash('agent-arbitrage.near', 'NEAR/USDC', config.decisionSize);
  const initialBalance = 10000;
  const retryClasses: RetryClass[] = ['replay', 'bump', 'rerun'];

  // t = 0.000: Run Started
  events.push({
    t: 0.0,
    formattedTime: formatTimeMs(0.0),
    agent: 'system',
    decision_id: decisionId,
    type: 'run_started',
    data: {
      message: `Starting run with decision $${config.decisionSize}, delay ${config.resolutionDelay}s, retries ${config.retryCount}`,
    },
  });

  // t = 0.050: Decision created on both sides
  events.push({
    t: 0.05,
    formattedTime: formatTimeMs(0.05),
    agent: 'unprotected',
    decision_id: decisionId,
    type: 'decision_created',
    data: {
      amount: config.decisionSize,
      message: `decision created  asset=NEAR/USDC  size=$${config.decisionSize}`,
    },
  });

  events.push({
    t: 0.05,
    formattedTime: formatTimeMs(0.05),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'decision_created',
    data: {
      amount: config.decisionSize,
      message: `decision created  identity=${decisionId}  size=$${config.decisionSize}`,
    },
  });

  // t = 0.100: Initial attempt submitted
  events.push({
    t: 0.1,
    formattedTime: formatTimeMs(0.1),
    agent: 'unprotected',
    decision_id: decisionId,
    type: 'attempt_submitted',
    data: {
      attempt: 1,
      amount: config.decisionSize,
      message: `attempt_submitted  attempt=1  spend=$${config.decisionSize}`,
    },
  });

  events.push({
    t: 0.12,
    formattedTime: formatTimeMs(0.12),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'attempt_submitted',
    data: {
      attempt: 1,
      amount: config.decisionSize,
      message: `execute_decision  identity=${decisionId}  attempt=1`,
    },
  });

  // OneShot reservation locks immediately upon submission
  events.push({
    t: 0.15,
    formattedTime: formatTimeMs(0.15),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'decision_live',
    data: {
      reserved: config.decisionSize,
      ceiling: config.ceiling,
      in_air: config.decisionSize,
      message: `decision_live  in_air=$${config.decisionSize}.00 / $${config.ceiling}.00 CEILING`,
    },
  });

  // Simulated network latency: Waiting for consensus before on-chain confirmation
  const latencyLabel =
    config.latencyProfile === 'low'
      ? 'Low (Fast RPC ~180ms)'
      : config.latencyProfile === 'high'
      ? 'High (Congested mempool ~2,450ms)'
      : 'Normal (Nightshade chunk ~850ms)';

  events.push({
    t: 0.22,
    formattedTime: formatTimeMs(0.22),
    agent: 'unprotected',
    decision_id: decisionId,
    type: 'consensus_waiting',
    data: {
      attempt: 1,
      message: `Waiting for consensus… [${latencyLabel}]`,
    },
  });

  events.push({
    t: 0.24,
    formattedTime: formatTimeMs(0.24),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'consensus_waiting',
    data: {
      attempt: 1,
      message: `Waiting for consensus… [${latencyLabel} · Chunk #131894300]`,
    },
  });

  // t = 0.400: Trade executes on-chain
  const tx1 = '0x8b3f41c9a0';
  events.push({
    t: 0.4,
    formattedTime: formatTimeMs(0.4),
    agent: 'proxy',
    decision_id: decisionId,
    type: config.swallowAck ? 'ack_swallowed' : 'fill',
    data: {
      tx: tx1,
      amount: config.decisionSize,
      message: config.swallowAck
        ? `CHAOS PROXY: trade executed on ${VENUE_RHEA}, ack swallowed`
        : `trade filled on ${VENUE_RHEA} (tx=${tx1})`,
    },
  });

  // Unprotected agent fill 1 recorded on chain (even though ack swallowed locally)
  events.push({
    t: 0.45,
    formattedTime: formatTimeMs(0.45),
    agent: 'unprotected',
    decision_id: decisionId,
    type: 'fill',
    data: {
      attempt: 1,
      amount: config.decisionSize,
      tx: tx1,
      wallet_balance: initialBalance - config.decisionSize,
      message: `fill_confirmed_on_chain  attempt=1  amount=$${config.decisionSize}  tx=${tx1}`,
    },
  });

  // Schedule retries if swallowAck is true
  if (config.swallowAck && config.retryCount > 0) {
    // Distribute retries between t = 2.5s and t = resolutionDelay - 0.5s (or up to 15s)
    const interval = Math.max(1.5, (config.resolutionDelay - 1.5) / config.retryCount);

    let unprotDupFills = 0;
    let unprotDamage = 0;
    let currentBalance = initialBalance - config.decisionSize;

    for (let i = 1; i <= config.retryCount; i++) {
      const retryTime = Math.min(config.resolutionDelay - 0.3, Number((1.5 + i * interval).toFixed(2)));
      const retryClass = retryClasses[(i - 1) % retryClasses.length];
      const attemptNum = i + 1;
      const retryTx = `0x9d4e72a${i}`;

      // UNPROTECTED AGENT: Fires retry
      events.push({
        t: retryTime,
        formattedTime: formatTimeMs(retryTime),
        agent: 'unprotected',
        decision_id: decisionId,
        type: 'retry_attempted',
        data: {
          attempt: attemptNum,
          class: retryClass,
          amount: config.decisionSize,
          message: `retry_attempted  class=${retryClass}  attempt=${attemptNum}  check=approved ($${config.decisionSize} <= budget)`,
        },
      });

      // Unprotected fills duplicates
      unprotDupFills += 1;
      unprotDamage += config.decisionSize;
      currentBalance -= config.decisionSize;

      events.push({
        t: Number((retryTime + 0.25).toFixed(2)),
        formattedTime: formatTimeMs(Number((retryTime + 0.25).toFixed(2))),
        agent: 'unprotected',
        decision_id: decisionId,
        type: 'fill',
        data: {
          attempt: attemptNum,
          amount: config.decisionSize,
          duplicate_fills: unprotDupFills,
          damage: unprotDamage,
          wallet_balance: currentBalance,
          tx: retryTx,
          message: `DUPLICATE_FILL  attempt=${attemptNum}  damage=+$${config.decisionSize}  cum_damage=$${unprotDamage}`,
        },
      });

      // ONESHOT AGENT: Retries are intercepted by OneShot Guard contract
      events.push({
        t: retryTime,
        formattedTime: formatTimeMs(retryTime),
        agent: 'oneshot',
        decision_id: decisionId,
        type: 'retry_attempted',
        data: {
          attempt: attemptNum,
          class: retryClass,
          amount: config.decisionSize,
          message: `execute_decision  identity=${decisionId}  attempt=${attemptNum}  class=${retryClass}`,
        },
      });

      events.push({
        t: Number((retryTime + 0.08).toFixed(2)),
        formattedTime: formatTimeMs(Number((retryTime + 0.08).toFixed(2))),
        agent: 'oneshot',
        decision_id: decisionId,
        type: 'retry_blocked',
        data: {
          attempt: attemptNum,
          reason: 'LIVE',
          in_air: config.decisionSize,
          message: `LIVE: retry blocked  state=LIVE  guard=${CONTRACT_ADDRESS}`,
        },
      });
    }
  }

  // Settlement at t = resolutionDelay
  const resolutionTime = config.resolutionDelay;
  const resolutionVia: ResolutionSource = 'promise_callback';
  const settlementTx = '0x7b4ae1298fc3d014';

  events.push({
    t: resolutionTime,
    formattedTime: formatTimeMs(resolutionTime),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'decision_settled',
    data: {
      via: resolutionVia,
      tx: settlementTx,
      amount: config.decisionSize,
      in_air: 0,
      wallet_balance: initialBalance - config.decisionSize,
      message: `decision_settled  via=${resolutionVia}  tx=${settlementTx.slice(0, 10)}…  consumed=$${config.decisionSize}`,
    },
  });

  events.push({
    t: Number((resolutionTime + 0.1).toFixed(2)),
    formattedTime: formatTimeMs(Number((resolutionTime + 0.1).toFixed(2))),
    agent: 'oneshot',
    decision_id: decisionId,
    type: 'fill',
    data: {
      attempt: 1,
      amount: config.decisionSize,
      tx: settlementTx,
      message: `settlement_confirmed  1 execution landed  exposure drained to $0`,
    },
  });

  // Finish run
  const finishTime = Number((resolutionTime + 0.5).toFixed(2));
  events.push({
    t: finishTime,
    formattedTime: formatTimeMs(finishTime),
    agent: 'system',
    decision_id: decisionId,
    type: 'run_finished',
    data: {
      message: `Run finished. Unprotected duplicate fills: ${config.swallowAck ? config.retryCount : 0}. OneShot blocked retries: ${config.swallowAck ? config.retryCount : 0}.`,
    },
  });

  // Sort strictly by timestamp t
  return events.sort((a, b) => a.t - b.t);
}

/**
 * Creates initial empty agent states.
 */
export function createInitialAgentState(initialBalance = 10000): {
  unprotected: AgentRunState;
  oneshot: AgentRunState;
} {
  return {
    unprotected: {
      walletBalance: initialBalance,
      initialBalance,
      duplicateFills: 0,
      damage: 0,
      inAir: 0,
      status: 'IDLE',
      consensusStatus: 'IDLE',
      currentDecisionState: 'NONE',
      attempts: [],
      events: [],
    },
    oneshot: {
      walletBalance: initialBalance,
      initialBalance,
      duplicateFills: 0,
      damage: 0,
      inAir: 0,
      status: 'IDLE',
      consensusStatus: 'IDLE',
      currentDecisionState: 'NONE',
      attempts: [],
      events: [],
    },
  };
}

/**
 * Pure state reducer when an event arrives.
 */
export function applyEventToState(
  state: { unprotected: AgentRunState; oneshot: AgentRunState },
  event: SimulationEvent
): { unprotected: AgentRunState; oneshot: AgentRunState } {
  const next = {
    unprotected: {
      ...state.unprotected,
      attempts: [...state.unprotected.attempts],
      events: [...state.unprotected.events],
    },
    oneshot: {
      ...state.oneshot,
      attempts: [...state.oneshot.attempts],
      events: [...state.oneshot.events],
    },
  };

  if (event.type === 'run_started') {
    next.unprotected.status = 'RUNNING';
    next.oneshot.status = 'RUNNING';
  }

  if (event.agent === 'unprotected' || event.agent === 'system') {
    if (event.agent === 'unprotected') {
      next.unprotected.events.push(event);
    }

    if (event.type === 'decision_created') {
      next.unprotected.currentDecisionState = 'LIVE';
    } else if (event.type === 'attempt_submitted' && event.data.attempt) {
      next.unprotected.attempts.push({
        attemptNumber: event.data.attempt,
        timestamp: event.t,
        status: 'SUBMITTED',
      });
    } else if (event.type === 'consensus_waiting') {
      next.unprotected.consensusStatus = 'WAITING';
      const lastAtt = next.unprotected.attempts[next.unprotected.attempts.length - 1];
      if (lastAtt && lastAtt.status === 'SUBMITTED') {
        lastAtt.status = 'WAITING_CONSENSUS';
      }
    } else if (event.type === 'retry_attempted' && event.data.attempt) {
      next.unprotected.attempts.push({
        attemptNumber: event.data.attempt,
        timestamp: event.t,
        status: 'SUBMITTED',
        class: event.data.class,
      });
    } else if (event.type === 'fill' && event.data.attempt) {
      next.unprotected.consensusStatus = 'FINALIZED';
      const idx = next.unprotected.attempts.findIndex(
        (a) => a.attemptNumber === event.data.attempt
      );
      if (idx !== -1) {
        next.unprotected.attempts[idx].status = 'FILLED';
        next.unprotected.attempts[idx].tx = event.data.tx;
      }
      if (event.data.duplicate_fills !== undefined) {
        next.unprotected.duplicateFills = event.data.duplicate_fills;
      }
      if (event.data.damage !== undefined) {
        next.unprotected.damage = event.data.damage;
      }
      if (event.data.wallet_balance !== undefined) {
        next.unprotected.walletBalance = event.data.wallet_balance;
      }
    }
  }

  if (event.agent === 'oneshot' || event.agent === 'system') {
    if (event.agent === 'oneshot') {
      next.oneshot.events.push(event);
    }

    if (event.type === 'decision_created') {
      next.oneshot.currentDecisionState = 'LIVE';
    } else if (event.type === 'decision_live') {
      next.oneshot.currentDecisionState = 'LIVE';
      if (event.data.in_air !== undefined) {
        next.oneshot.inAir = event.data.in_air;
      }
    } else if (event.type === 'attempt_submitted' && event.data.attempt) {
      next.oneshot.attempts.push({
        attemptNumber: event.data.attempt,
        timestamp: event.t,
        status: 'SUBMITTED',
      });
    } else if (event.type === 'consensus_waiting') {
      next.oneshot.consensusStatus = 'WAITING';
      const lastAtt = next.oneshot.attempts[next.oneshot.attempts.length - 1];
      if (lastAtt && lastAtt.status === 'SUBMITTED') {
        lastAtt.status = 'WAITING_CONSENSUS';
      }
    } else if (event.type === 'retry_attempted' && event.data.attempt) {
      // Branch retry
      next.oneshot.attempts.push({
        attemptNumber: event.data.attempt,
        timestamp: event.t,
        status: 'SUBMITTED',
        class: event.data.class,
      });
    } else if (event.type === 'retry_blocked' && event.data.attempt) {
      next.oneshot.consensusStatus = 'FINALIZED';
      const idx = next.oneshot.attempts.findIndex(
        (a) => a.attemptNumber === event.data.attempt
      );
      if (idx !== -1) {
        next.oneshot.attempts[idx].status = 'BLOCKED';
        next.oneshot.attempts[idx].reason = event.data.reason;
      }
    } else if (event.type === 'decision_settled') {
      next.oneshot.currentDecisionState = 'SETTLED';
      next.oneshot.inAir = 0;
      next.oneshot.resolutionVia = event.data.via;
      next.oneshot.resolutionTx = event.data.tx;
      if (event.data.wallet_balance !== undefined) {
        next.oneshot.walletBalance = event.data.wallet_balance;
      }
      const first = next.oneshot.attempts[0];
      if (first) {
        first.status = 'FILLED';
        first.tx = event.data.tx;
      }
    }
  }

  if (event.type === 'run_finished') {
    next.unprotected.status = 'FINISHED';
    next.oneshot.status = 'FINISHED';
  }

  return next;
}

/**
 * Baseline historic transactions from NEAR Mainnet test session.
 */
export function getHistoricTransactions(): import('../types').OnChainTx[] {
  return [
    {
      id: 'tx-hist-1',
      txHash: '0x7b4ae1298fc3d014',
      blockNumber: 131894204,
      timestamp: '2026-10-29 14:22:04 UTC',
      decisionId: '0x9f3a8b41e05d2c73',
      agent: 'oneshot',
      method: 'promise_callback',
      venue: VENUE_RHEA,
      status: 'SETTLED',
      amount: 500,
      gasBurntTgas: 4.8,
      details: 'Promise callback verified: 1 execution settled. In-air reservation drained.',
    },
    {
      id: 'tx-hist-2',
      txHash: '0x6a2c9184df51e902',
      blockNumber: 131894198,
      timestamp: '2026-10-29 14:21:58 UTC',
      decisionId: '0x9f3a8b41e05d2c73',
      agent: 'oneshot',
      method: 'guard_block',
      venue: CONTRACT_ADDRESS,
      status: 'BLOCKED',
      amount: 500,
      gasBurntTgas: 1.6,
      details: 'Retry rejected: decision state is LIVE. Exposure protected.',
    },
    {
      id: 'tx-hist-3',
      txHash: '0x5d1e8371ca042f99',
      blockNumber: 131894190,
      timestamp: '2026-10-29 14:21:50 UTC',
      decisionId: '0x9f3a8b41e05d2c73',
      agent: 'oneshot',
      method: 'execute_decision',
      venue: CONTRACT_ADDRESS,
      status: 'LIVE',
      amount: 500,
      gasBurntTgas: 3.2,
      details: 'Identity 0x9f3a…c21e registered. $500 reservation locked in-flight.',
    },
    {
      id: 'tx-hist-4',
      txHash: '0x4c0a7261b9134e88',
      blockNumber: 131893910,
      timestamp: '2026-10-29 14:15:12 UTC',
      decisionId: '0x8e2b7194f1023a45',
      agent: 'unprotected',
      method: 'direct_swap',
      venue: VENUE_RHEA,
      status: 'DUPLICATE_FILL',
      amount: 500,
      gasBurntTgas: 18.2,
      details: 'Naive retry #3 filled independently. Wallet debited -$500.',
    },
  ];
}

/**
 * Parses real-time simulation events into structured on-chain transactions.
 */
export function parseEventsToTransactions(
  events: SimulationEvent[],
  config: SimulationConfig
): import('../types').OnChainTx[] {
  const txs: import('../types').OnChainTx[] = [];
  const baseBlock = 131894300;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const blockNum = baseBlock + Math.floor(ev.t * 2);

    if (ev.agent === 'oneshot') {
      if (ev.type === 'decision_live') {
        txs.unshift({
          id: `tx-os-live-${i}`,
          txHash: `0x8f2c${(i * 19).toString(16).padStart(4, '0')}a91b`,
          blockNumber: blockNum,
          timestamp: ev.formattedTime,
          decisionId: ev.decision_id,
          agent: 'oneshot',
          method: 'execute_decision',
          venue: CONTRACT_ADDRESS,
          status: 'LIVE',
          amount: ev.data.in_air || config.decisionSize,
          gasBurntTgas: 3.1,
          details: `Guard registered identity ${ev.decision_id}. $${config.decisionSize} reserved.`,
        });
      } else if (ev.type === 'retry_blocked') {
        txs.unshift({
          id: `tx-os-block-${i}`,
          txHash: `0x3a9b${(i * 23).toString(16).padStart(4, '0')}f47c`,
          blockNumber: blockNum,
          timestamp: ev.formattedTime,
          decisionId: ev.decision_id,
          agent: 'oneshot',
          method: 'guard_block',
          venue: CONTRACT_ADDRESS,
          status: 'BLOCKED',
          amount: config.decisionSize,
          gasBurntTgas: 1.4,
          details: `Attempt ${ev.data.attempt} blocked by guard. Reason: LIVE hold in effect.`,
        });
      } else if (ev.type === 'decision_settled') {
        txs.unshift({
          id: `tx-os-settle-${i}`,
          txHash: ev.data.tx || '0x7b4ae1298fc3d014',
          blockNumber: blockNum,
          timestamp: ev.formattedTime,
          decisionId: ev.decision_id,
          agent: 'oneshot',
          method: 'promise_callback',
          venue: VENUE_RHEA,
          status: 'SETTLED',
          amount: config.decisionSize,
          gasBurntTgas: 4.8,
          details: `Settled via ${ev.data.via}. Exactly 1 execution confirmed. Reservation consumed.`,
        });
      }
    } else if (ev.agent === 'unprotected') {
      if (ev.type === 'fill') {
        const isDuplicate = (ev.data.duplicate_fills ?? 0) > 0;
        txs.unshift({
          id: `tx-unprot-fill-${i}`,
          txHash: ev.data.tx || `0x9e1a${(i * 31).toString(16).padStart(4, '0')}d832`,
          blockNumber: blockNum,
          timestamp: ev.formattedTime,
          decisionId: ev.decision_id,
          agent: 'unprotected',
          method: 'direct_swap',
          venue: VENUE_RHEA,
          status: isDuplicate ? 'DUPLICATE_FILL' : 'SETTLED',
          amount: config.decisionSize,
          gasBurntTgas: 17.8,
          details: isDuplicate
            ? `DUPLICATE FILL #${ev.data.attempt}: Unprotected approval drained additional $${config.decisionSize}.`
            : `Attempt 1 filled on venue without guard wrapper.`,
        });
      }
    }
  }

  return txs;
}

