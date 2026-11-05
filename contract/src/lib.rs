//! OneShot Guard — execution integrity for AI agents on NEAR.
//!
//! One decision. At most one live execution. Total in-flight exposure capped.
//!
//! Core invariant: a new execution for a decision is only possible if that
//! decision is provably dead (EXPIRED) or new. A timeout can never create an
//! execution; only provable downstream evidence (promise callback) or the
//! passage of the identity's own expiry can resolve a state.

use near_sdk::store::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, PanicOnDefault, Promise, PromiseOrValue, PromiseResult};

const DECISION_ID_HEX_LEN: usize = 64; // 32 bytes hex

/// Gas for the downstream venue call.
const VENUE_GAS: Gas = Gas::from_tgas(15);
/// Gas for the resolution callback leg.
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecisionState {
    /// An execution attempt is in flight; spend reserved; retries blocked.
    Live,
    /// Provably resolved with effects. Original result owns the outcome.
    Settled,
    /// Provably dead: deadline passed unexecuted, or downstream failed and
    /// returned zero effects. Reservation released. Fresh attempt is safe.
    Expired,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct DecisionRecord {
    pub state: DecisionState,
    pub executor: AccountId,
    pub venue: AccountId,
    pub method: Option<String>,
    /// Amount reserved against the executor's in-flight ceiling.
    pub reserved: u128,
    /// Attached deposit that rode with the attempt (part of reserved).
    pub deposit: u128,
    /// Absolute block height after which this attempt is provably dead.
    pub expiry_height: u64,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct DecisionView {
    pub decision_id: String,
    pub state: DecisionState,
    pub executor: AccountId,
    pub venue: AccountId,
    pub reserved: U128,
    pub expiry_height: u64,
    pub blocks_remaining: i64,
    pub in_air_total: U128,
}

#[near(serializers = [json])]
#[derive(Debug, Clone)]
pub struct ExecuteArgs {
    /// 32-byte content-derived decision identity, hex. Computed off-chain
    /// from (agent, asset, size, direction, slippage, expiry) — NOT from
    /// transaction bytes. Replay / gas-bump / rerun retry classes all
    /// collapse into this single identity.
    pub decision_id: String,
    /// Downstream contract that performs the actual trade.
    pub venue: AccountId,
    /// Method on the venue contract to call with `args`.
    pub method: String,
    /// Serialized JSON args for the venue call.
    pub args: String,
    /// Attached deposit forwarded to the venue.
    pub deposit: U128,
    /// Absolute block height at which this attempt is provably dead.
    /// Client computes: height + (expiry_seconds / block_time) + margin.
    pub expiry_height: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// Agent-wide ceiling: total unsettled (in-flight) commitments across
    /// ALL decisions of this executor. Beyond the ceiling reverts atomically.
    pub in_flight_ceiling: U128,
}

#[ext_contract(ext_venue)]
pub trait Venue {
    #[result_serializer(borsh=false)]
    fn execute(&self, payload: String) -> String;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OneShotGuard {
    /// decision_id (hex) -> record.
    decisions: UnorderedMap<String, DecisionRecord>,
    /// executor -> configured ceiling.
    configs: UnorderedMap<AccountId, AgentConfig>,
    /// executor -> total reservations currently in flight (LIVE).
    in_air: UnorderedMap<AccountId, u128>,
    /// Protocol-level default ceiling for agents without a profile.
    default_ceiling: u128,
}

#[near]
impl OneShotGuard {
    #[init]
    pub fn new(default_ceiling: U128) -> Self {
        Self {
            decisions: UnorderedMap::new(b"d"),
            configs: UnorderedMap::new(b"c"),
            in_air: UnorderedMap::new(b"a"),
            default_ceiling: default_ceiling.0,
        }
    }

    /// Agent profile. Sets (or tightens) the executor's in-flight ceiling.
    #[payable]
    pub fn set_agent_config(&mut self, ceiling: U128) {
        let actor = env::predecessor_account_id();
        require!(ceiling.0 > 0, "ceiling must be > 0");
        let cur = self.in_air.get(&actor).copied().unwrap_or(0);
        require!(ceiling.0 >= cur, "ceiling below current in-air");
        self.configs.insert(actor.clone(), AgentConfig { in_flight_ceiling: ceiling });
        Self::emit(
            "config_set",
            serde_json::json!({ "agent": actor.to_string(), "ceiling": ceiling.0.to_string() }),
        );
    }

    pub fn get_agent_config(&self, agent: AccountId) -> AgentConfig {
        self.configs
            .get(&agent)
            .unwrap_or(&AgentConfig { in_flight_ceiling: U128(self.default_ceiling) }).clone()
    }

    pub fn get_in_air(&self, agent: AccountId) -> U128 {
        U128(self.in_air.get(&agent).copied().unwrap_or(0))
    }

    /// Guarded execution.
    ///
    /// Registry semantics:
    ///   - unknown id        → reserve + go LIVE
    ///   - Live, not expired → deterministic reject (ONESHOT: retry blocked)
    ///   - Live, past expiry → supersede: release stale reservation, re-reserve
    ///   - Settled           → deterministic reject
    ///   - Expired           → safe re-attempt: reserve + go LIVE
    #[payable]
    pub fn execute_decision(&mut self, args: ExecuteArgs) -> PromiseOrValue<String> {
        let executor = env::predecessor_account_id();
        let attached = env::attached_deposit();
        let hex = args.decision_id.trim().to_lowercase();
        require!(hex.len() == DECISION_ID_HEX_LEN, "ONESHOT: malformed decision identity");

        let spend = attached.as_yoctonear().max(args.deposit.0);
        require!(spend > 0, "ONESHOT: zero-spend attempt");

        let block_h = env::block_height();
        require!(
            args.expiry_height > block_h,
            "ONESHOT: expiry_height not in the future"
        );

        // ── registry check ────────────────────────────────────────────────
        let mut supersede_release: Option<u128> = None;
        if let Some(rec) = self.decisions.get(&hex) {
            match rec.state {
                DecisionState::Live => {
                    if block_h >= rec.expiry_height {
                        // Provably stale: gas-bump/supersede path. Release the
                        // stale reservation atomically before re-reserving.
                        supersede_release = Some(rec.reserved);
                    } else {
                        env::panic_str("ONESHOT: retry blocked — decision state is LIVE");
                    }
                }
                DecisionState::Settled => {
                    env::panic_str("ONESHOT: retry blocked — decision already SETTLED");
                }
                DecisionState::Expired => { /* safe re-attempt */ }
            }
        }

        // ── atomic reservation + ceiling ──────────────────────────────────
        let ceiling = self.get_agent_config(executor.clone()).in_flight_ceiling.0;
        let currently_in_air = self.in_air.get(&executor).copied().unwrap_or(0);
        let released = supersede_release.unwrap_or(0);
        let net_in_air = currently_in_air - released;
        require!(
            net_in_air + spend <= ceiling,
            "ONESHOT: reservation would breach agent in-flight ceiling"
        );
        self.in_air.insert(executor.clone(), net_in_air + spend);

        self.decisions.insert(
            hex.clone(),
            DecisionRecord {
                state: DecisionState::Live,
                executor: executor.clone(),
                venue: args.venue.clone(),
                method: Some(args.method.clone()),
                reserved: spend,
                deposit: attached.as_yoctonear(),
                expiry_height: args.expiry_height,
            },
        );

        Self::emit(
            "decision_live",
            serde_json::json!({
                "decision_id": hex,
                "executor": executor.to_string(),
                "venue": args.venue.to_string(),
                "reserved": spend.to_string(),
                "in_air": (net_in_air + spend).to_string(),
                "ceiling": ceiling.to_string(),
                "expiry_height": args.expiry_height,
            }),
        );

        // ── forward + resolution callback ─────────────────────────────────
        // The callback closes the loop ON-CHAIN: SETTLED on downstream
        // success, EXPIRED (reservation released) on downstream failure.
        // No oracle. No indexer. No guessing.
        let promise: Promise = ext_venue::ext(args.venue.clone())
            .with_attached_deposit(attached)
            .with_static_gas(VENUE_GAS)
            .execute(args.args);

        promise
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_resolution(hex.clone()),
            )
            .into()
    }

    /// Resolution callback. Success → SETTLED. Failure → EXPIRED (released).
    #[private]
    pub fn on_resolution(&mut self, decision_id: String) -> String {
        let failure = matches!(env::promise_result(0), PromiseResult::Failed);
        let mut rec = self
            .decisions
            .get(&decision_id)
            .unwrap_or_else(|| env::panic_str("ONESHOT: orphan callback"))
            .clone();

        if failure {
            // Downstream provably did not execute. Release reservation.
            rec.state = DecisionState::Expired;
            self.release_in_air(&rec);
            self.decisions.insert(decision_id.clone(), rec.clone());
            Self::emit(
                "decision_expired",
                serde_json::json!({ "decision_id": decision_id, "reason": "venue_call_failed" }),
            );
        } else {
            rec.state = DecisionState::Settled;
            // Reservation consumed by settlement. Drain in-air. A production
            // iteration would reconcile partial fills into actual spend.
            self.release_in_air(&rec);
            self.decisions.insert(decision_id.clone(), rec.clone());
            Self::emit(
                "decision_settled",
                serde_json::json!({ "decision_id": decision_id, "via": "promise_callback" }),
            );
        }
        decision_id
    }

    /// Lazy LIVE→EXPIRED once the identity's expiry height has passed.
    /// Objectively derivable; anyone may call it.
    pub fn resolve_expired(&mut self, decision_id: String) {
        let mut rec = self
            .decisions
            .get(&decision_id)
            .unwrap_or_else(|| env::panic_str("ONESHOT: unknown decision"))
            .clone();
        require!(rec.state == DecisionState::Live, "ONESHOT: already resolved");
        require!(
            env::block_height() >= rec.expiry_height,
            "ONESHOT: retry blocked — decision state is LIVE"
        );
        rec.state = DecisionState::Expired;
        self.release_in_air(&rec);
        self.decisions.insert(decision_id.clone(), rec.clone());
        Self::emit(
            "decision_expired",
            serde_json::json!({ "decision_id": decision_id, "reason": "expiry_height_passed" }),
        );
    }

    /// Executor-only cancel of a LIVE decision.
    ///
    /// Guard-state cancel only: it moves the guard record to EXPIRED and
    /// releases the reservation, so a fresh attempt with the same identity
    /// is safe *from the guard's point of view*.
    ///
    /// For the NEAR Intents path this is NOT sufficient on its own: the
    /// intent's nonce must also be invalidated on-chain (or its deadline
    /// must have passed with no settlement) before the decision is treated
    /// as EXPIRED, otherwise the intent could still settle after cancel.
    /// Callers for the Intents path must check that invalidation first and
    /// only then call this, or use a dedicated Intents cancel flow.
    pub fn cancel_decision(&mut self, decision_id: String) {
        let mut rec = self
            .decisions
            .get(&decision_id)
            .unwrap_or_else(|| env::panic_str("ONESHOT: unknown decision"))
            .clone();
        require!(rec.state == DecisionState::Live, "ONESHOT: already resolved");
        require!(
            rec.executor == env::predecessor_account_id(),
            "ONESHOT: only the executor may cancel"
        );
        rec.state = DecisionState::Expired;
        self.release_in_air(&rec);
        self.decisions.insert(decision_id.clone(), rec.clone());
        Self::emit(
            "decision_expired",
            serde_json::json!({ "decision_id": decision_id, "reason": "cancelled_by_executor" }),
        );
    }

    // ── views ─────────────────────────────────────────────────────────────

    pub fn get_decision(&self, decision_id: String) -> Option<DecisionView> {
        let rec = self.decisions.get(&decision_id)?;
        Some(DecisionView {
            state: rec.state,
            executor: rec.executor.clone(),
            venue: rec.venue.clone(),
            reserved: U128(rec.reserved),
            expiry_height: rec.expiry_height,
            blocks_remaining: rec.expiry_height as i64 - env::block_height() as i64,
            decision_id,
            in_air_total: U128(self.in_air.get(&rec.executor).copied().unwrap_or(0)),
        })
    }

    // ── internal ──────────────────────────────────────────────────────────

    fn release_in_air(&mut self, rec: &DecisionRecord) {
        let cur = self.in_air.get(&rec.executor).copied().unwrap_or(0);
        self.in_air.insert(rec.executor.clone(), cur.saturating_sub(rec.reserved));
    }

    fn emit(kind: &str, payload: serde_json::Value) {
        env::log_str(&serde_json::json!({ "std": "oneshot", "event": kind, "data": payload }).to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, testing_env_with_promise_results, VMContextBuilder};
    use near_sdk::{testing_env, NearToken, PromiseResult};

    const AGENT: &str = "agent.testnet";
    const VENUE: &str = "venue.testnet";
    const ID: &str = "9f3a8b41e05d2c73aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffff01";
    const CEILING: u128 = 1_000;

    fn actor_ctx(actor: &AccountId, block: u64, attached: u128) -> VMContextBuilder {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(accounts(2))
            .signer_account_id(accounts(2))
            .predecessor_account_id(actor.clone())
            .attached_deposit(NearToken::from_yoctonear(attached))
            .block_height(block);
        ctx
    }

    fn fresh_guard() -> OneShotGuard {
        testing_env!(actor_ctx(&accounts(2), 10, 0).build());
        let mut g = OneShotGuard::new(U128(CEILING));
        testing_env!(actor_ctx(&accounts(2), 10, 0).build());
        g.set_agent_config(U128(CEILING));
        g
    }

    fn exec_args(id: &str, deposit: u128, expire_at: u64) -> ExecuteArgs {
        ExecuteArgs {
            decision_id: id.to_string(),
            venue: VENUE.parse().unwrap(),
            method: "execute".into(),
            args: "{\"a\":1}".into(),
            deposit: U128(deposit),
            expiry_height: expire_at,
        }
    }

    /// 1) A fresh decision goes LIVE, reserves the spend, reaches the venue.
    #[test]
    fn fresh_decision_goes_live_and_reserves() {
        let mut g = fresh_guard();
        let arg = exec_args(ID, 400, 50);
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(arg);

        let v = g.get_decision(ID.to_string()).unwrap();
        assert_eq!(v.state, DecisionState::Live);
        assert_eq!(v.reserved, U128(400));
        assert_eq!(v.in_air_total, U128(400));
        assert_eq!(v.blocks_remaining, 40);
    }

    /// 2) A retry while LIVE and unexpired is deterministically rejected.
    #[test]
    #[should_panic(expected = "retry blocked")]
    fn retry_while_live_is_blocked() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));

        // A second attempt, same identity, still inside the window.
        testing_env!(actor_ctx(&accounts(2), 12, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
    }

    /// 3) Promise success settles the decision and drains the reservation.
    #[test]
    fn settlement_sets_and_drains_reservation() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));

        // Callback arrives from the guard itself (predecessor == current id).
        let guard_acc = accounts(2);
        testing_env_with_promise_results(
            {
                let mut ctx = actor_ctx(&guard_acc, 12, 0);
                ctx.signer_account_id(guard_acc.clone());
                ctx.build()
            },
            PromiseResult::Successful(b"ok".to_vec()),
        );
        g.on_resolution(ID.to_string());

        let v = g.get_decision(ID.to_string()).unwrap();
        assert_eq!(v.state, DecisionState::Settled);
        assert_eq!(v.in_air_total, U128(0));
    }

    /// 4) A decision that settled keeps rejecting attempts — for good.
    #[test]
    #[should_panic(expected = "already SETTLED")]
    fn settled_rejects_further_attempts() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
        let guard_acc = accounts(2);
        testing_env_with_promise_results(
            { let mut ctx = actor_ctx(&guard_acc, 12, 0); ctx.signer_account_id(guard_acc.clone()); ctx.build() },
            PromiseResult::Successful(b"ok".to_vec()),
        );
        g.on_resolution(ID.to_string());

        testing_env!(actor_ctx(&accounts(2), 14, 400).build());
        g.execute_decision(exec_args(ID, 400, 60));
    }

    /// 5) Promise failure provably releases the reservation; a fresh
    ///    attempt with the same identity is now SAFE (classify: retry).
    #[test]
    fn failure_releases_and_allows_fresh_attempt() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
        let guard_acc = accounts(2);
        testing_env_with_promise_results(
            { let mut ctx = actor_ctx(&guard_acc, 12, 0); ctx.signer_account_id(guard_acc.clone()); ctx.build() },
            PromiseResult::Failed,
        );
        g.on_resolution(ID.to_string());

        assert_eq!(g.get_decision(ID.to_string()).unwrap().state, DecisionState::Expired);
        assert_eq!(g.get_in_air(accounts(2)), U128(0));

        // Safe re-attempt without tripping the ceiling.
        testing_env!(actor_ctx(&accounts(2), 13, 400).build());
        g.execute_decision(exec_args(ID, 400, 60));
        assert_eq!(g.get_in_air(accounts(2)), U128(400));
        assert_eq!(g.get_decision(ID.to_string()).unwrap().state, DecisionState::Live);
    }

    /// 6) Ceiling breach reverts atomically — no reservation, no live intent.
    #[test]
    #[should_panic(expected = "in-flight ceiling")]
    fn ceiling_breach_reverts() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 300).build());
        g.execute_decision(exec_args(ID, 300, 50));
        // 300 + 800 <= 1000, ok; but 300 + 900 breaks the ceiling.
        testing_env!(actor_ctx(&accounts(2), 11, 900).build());
        g.execute_decision(exec_args("0f3a8b41e05d2c73aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffff02", 900, 50));
    }

    /// 7) A gas-bump supersede of a stale attempt releases the old
    ///    reservation atomically: net in-air never double-counts.
    #[test]
    fn supersede_releases_stale_reservation() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        // Attempt expires at height 20; consensus is "running".
        g.execute_decision(exec_args(ID, 400, 20));
        assert_eq!(g.get_in_air(accounts(2)), U128(400));

        // Later (h=30, way past expiry), the agent re-raises with bumped gas.
        // No resolve_expired has been called — guard must not double count.
        testing_env!(actor_ctx(&accounts(2), 30, 400).build());
        g.execute_decision(exec_args(ID, 400, 80));
        assert_eq!(g.get_in_air(accounts(2)), U128(400)); // released 400, re-reserved 400
        let v = g.get_decision(ID.to_string()).unwrap();
        assert_eq!(v.state, DecisionState::Live);
        assert_eq!(v.expiry_height, 80);
    }

    /// 8) resolve_expired drains LIVE attempts whose identity-expiry passed
    ///    without a settlement — the "never" branch becomes first-class.
    #[test]
    fn expire_past_height_releases() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 20));

        testing_env!(actor_ctx(&accounts(2), 21, 0).build());
        g.resolve_expired(ID.to_string());

        assert_eq!(g.get_decision(ID.to_string()).unwrap().state, DecisionState::Expired);
        assert_eq!(g.get_in_air(accounts(2)), U128(0));
    }

    /// 9) resolve_expired before expiry is rejected.
    #[test]
    #[should_panic(expected = "retry blocked")]
    fn expiry_only_after_height() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
        testing_env!(actor_ctx(&accounts(2), 20, 0).build());
        g.resolve_expired(ID.to_string());
    }

    /// 10) Malformed identity (worst-case) is refused.
    #[test]
    #[should_panic(expected = "malformed decision identity")]
    fn malformed_identity_rejected() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args("0x1234", 400, 50));
    }

    /// 11) Executor cancel releases the reservation and allows a fresh attempt.
    #[test]
    fn cancel_by_executor_releases_and_allows_fresh_attempt() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
        assert_eq!(g.get_in_air(accounts(2)), U128(400));

        testing_env!(actor_ctx(&accounts(2), 12, 0).build());
        g.cancel_decision(ID.to_string());

        assert_eq!(g.get_decision(ID.to_string()).unwrap().state, DecisionState::Expired);
        assert_eq!(g.get_in_air(accounts(2)), U128(0));

        testing_env!(actor_ctx(&accounts(2), 13, 400).build());
        g.execute_decision(exec_args(ID, 400, 60));
        assert_eq!(g.get_decision(ID.to_string()).unwrap().state, DecisionState::Live);
    }

    /// 12) Cancel by a non-executor is rejected.
    #[test]
    #[should_panic(expected = "only the executor may cancel")]
    fn cancel_by_non_executor_rejected() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));

        // accounts(3) is not the executor (accounts(2) in fresh_guard tests).
        testing_env!(actor_ctx(&accounts(3), 12, 0).build());
        g.cancel_decision(ID.to_string());
    }

    /// 13) Cancel of a settled decision is rejected.
    #[test]
    #[should_panic(expected = "already resolved")]
    fn cancel_of_settled_rejected() {
        let mut g = fresh_guard();
        testing_env!(actor_ctx(&accounts(2), 10, 400).build());
        g.execute_decision(exec_args(ID, 400, 50));
        let guard_acc = accounts(2);
        testing_env_with_promise_results(
            { let mut ctx = actor_ctx(&guard_acc, 12, 0); ctx.signer_account_id(guard_acc.clone()); ctx.build() },
            PromiseResult::Successful(b"ok".to_vec()),
        );
        g.on_resolution(ID.to_string());

        testing_env!(actor_ctx(&accounts(2), 14, 0).build());
        g.cancel_decision(ID.to_string());
    }
}
