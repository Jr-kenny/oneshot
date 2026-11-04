import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSimulationSchedule,
  createInitialAgentState,
  applyEventToState,
  DEFAULT_CONFIG,
  formatTimeMs,
  parseEventsToTransactions,
  getHistoricTransactions,
} from './simulationEngine';

test('formatTimeMs formats minutes, seconds, milliseconds accurately', () => {
  assert.equal(formatTimeMs(0.4), '[00:00.400]');
  assert.equal(formatTimeMs(15.123), '[00:15.123]');
  assert.equal(formatTimeMs(65.05), '[01:05.050]');
});

test('buildSimulationSchedule creates ordered events with correct retry count and damage', () => {
  const config = { ...DEFAULT_CONFIG, retryCount: 5, decisionSize: 500, resolutionDelay: 15 };
  const schedule = buildSimulationSchedule(config);

  assert.ok(schedule.length > 10, 'schedule should contain full timeline of events');

  // Verify chronological ordering
  for (let i = 1; i < schedule.length; i++) {
    assert.ok(
      schedule[i].t >= schedule[i - 1].t,
      `Event ${i} at t=${schedule[i].t} must be >= event ${i - 1} at t=${schedule[i - 1].t}`
    );
  }

  // Count unprotected duplicate fills vs OneShot blocked retries
  const unprotFills = schedule.filter(
    (e) => e.agent === 'unprotected' && e.type === 'fill' && (e.data.duplicate_fills ?? 0) > 0
  );
  assert.equal(unprotFills.length, 5, 'Unprotected agent should have 5 duplicate fills');

  const oneshotBlocked = schedule.filter(
    (e) => e.agent === 'oneshot' && e.type === 'retry_blocked'
  );
  assert.equal(oneshotBlocked.length, 5, 'OneShot agent must intercept and block all 5 retries');
});

test('OneShot state invariant: exactly one fill, 0 damage, in-air drains on settlement', () => {
  const config = { ...DEFAULT_CONFIG, retryCount: 4, decisionSize: 500, resolutionDelay: 8 };
  const schedule = buildSimulationSchedule(config);

  let state = createInitialAgentState(10000);
  for (const event of schedule) {
    state = applyEventToState(state, event);
  }

  // Unprotected outcome
  assert.equal(state.unprotected.duplicateFills, 4);
  assert.equal(state.unprotected.damage, 2000);
  assert.equal(state.unprotected.walletBalance, 10000 - 500 - 2000);

  // OneShot outcome
  assert.equal(state.oneshot.duplicateFills, 0, 'OneShot duplicate fills must be 0');
  assert.equal(state.oneshot.damage, 0, 'OneShot damage must be $0');
  assert.equal(state.oneshot.inAir, 0, 'In-air reservation must drain to 0 upon settlement');
  assert.equal(state.oneshot.currentDecisionState, 'SETTLED');
  assert.equal(state.oneshot.walletBalance, 10000 - 500);

  // All 4 retries in OneShot must be BLOCKED
  const blockedAttempts = state.oneshot.attempts.filter((a) => a.status === 'BLOCKED');
  assert.equal(blockedAttempts.length, 4);
});

test('parseEventsToTransactions parses simulation events into structured on-chain transactions', () => {
  const historic = getHistoricTransactions();
  assert.ok(historic.length >= 4, 'should provide baseline historic transactions');

  const config = { ...DEFAULT_CONFIG, retryCount: 3, decisionSize: 500, resolutionDelay: 8 };
  const schedule = buildSimulationSchedule(config);
  const txs = parseEventsToTransactions(schedule, config);

  assert.ok(txs.length > 0, 'should generate on-chain transactions from schedule');
  const blockedTxs = txs.filter((t: any) => t.status === 'BLOCKED');
  assert.equal(blockedTxs.length, 3, 'should parse exactly 3 blocked guard transactions');

  const settledTx = txs.find((t: any) => t.status === 'SETTLED' && t.agent === 'oneshot');
  assert.ok(settledTx, 'should parse the settled OneShot transaction');
  assert.equal(settledTx.method, 'promise_callback');
});

test('buildSimulationSchedule adapts consensus latency messages based on latencyProfile', () => {
  const lowSchedule = buildSimulationSchedule({ ...DEFAULT_CONFIG, latencyProfile: 'low' });
  const lowWait = lowSchedule.find((e) => e.type === 'consensus_waiting' && e.agent === 'oneshot');
  assert.ok(lowWait?.data.message?.includes('Low (Fast RPC'));

  const highSchedule = buildSimulationSchedule({ ...DEFAULT_CONFIG, latencyProfile: 'high' });
  const highWait = highSchedule.find((e) => e.type === 'consensus_waiting' && e.agent === 'oneshot');
  assert.ok(highWait?.data.message?.includes('High (Congested'));

  const medSchedule = buildSimulationSchedule({ ...DEFAULT_CONFIG, latencyProfile: 'medium' });
  const medWait = medSchedule.find((e) => e.type === 'consensus_waiting' && e.agent === 'oneshot');
  assert.ok(medWait?.data.message?.includes('Normal (Nightshade'));
});

