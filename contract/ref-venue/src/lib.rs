//! Ref venue — REAL DEX execution target for OneShot on NEAR testnet.
//!
//! This is the venue the OneShot guard forwards a decision into when the
//! demo runs against a real market instead of the mock venue. It speaks the
//! exact interface the guard expects — `execute(payload: String)` — and
//! turns the guard's attached NEAR deposit into a real swap:
//!
//!   1. `wrap.testnet.near_deposit` — wrap the attached NEAR into wNEAR.
//!   2. `wrap.testnet.ft_transfer_call` to `ref-finance-101.testnet` with a
//!      Ref swap message — swap wNEAR -> USDC.e (`usdc.fakes.testnet`) in
//!      one SIMPLE_POOL (default pool 2896, the testnet wNEAR/USDC.e pool
//!      whose price is closest to a real NEAR price; see STATUS-TESTNET.md).
//!
//! The USDC.e proceeds land in THIS contract. The demo reads them back
//! from `usdc.fakes.testnet` (`ft_balance_of` for this account) — no
//! claimed amount is ever trusted without that chain read.
//!
//! Settlement semantics are the guard's, unchanged: the guard's promise
//! callback settles the decision iff this whole promise chain succeeds.
//! Any hop failing (wrap, swap, min-out breach) fails the chain, and the
//! guard marks the decision EXPIRED and releases the reservation.
//!
//! Testnet only. Faucet tokens only. No mainnet code path exists here.

use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult};

/// Ref Finance exchange on NEAR testnet (verified: ref-finance/guide
/// contracts.md + @plt_dev/ref-sdk testnet config).
pub const DEFAULT_REF_EXCHANGE: &str = "ref-finance-101.testnet";
/// Wrapped NEAR on testnet.
pub const DEFAULT_WNEAR: &str = "wrap.testnet";
/// Testnet USDC: "Bridged USDC", symbol USDC.e, 6 decimals (ft_metadata
/// read from chain 2026-11-07).
pub const DEFAULT_USDC: &str = "usdc.fakes.testnet";
/// Default pool: wNEAR/USDC.e SIMPLE_POOL, fee 30 (0.3%). Chosen because
/// its implied price (~$4/NEAR) is closest to a real NEAR price; the big
/// testnet pools are seeded at arbitrary ratios and quote absurd prices
/// (see STATUS-TESTNET.md). The pool id is overridable per payload.
pub const DEFAULT_POOL_ID: u64 = 2896;

/// Gas for the wrap hop (near_deposit is cheap).
const WRAP_GAS: Gas = Gas::from_tgas(10);
/// Gas for the wrap callback leg.
const WRAP_CALLBACK_GAS: Gas = Gas::from_tgas(10);
/// Gas for the ft_transfer_call + Ref swap execution inside it. Ref swaps
/// are the heavy hop; wallets typically attach 30-100 TGas for one.
const SWAP_GAS: Gas = Gas::from_tgas(60);
/// Gas for the swap callback leg (bookkeeping + receipt only).
const SWAP_CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[ext_contract(ext_wrap)]
pub trait WrapNear {
    fn near_deposit(&mut self);
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct VenueConfig {
    pub ref_exchange: AccountId,
    pub wnear: AccountId,
    pub usdc: AccountId,
    pub pool_id: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SwapRecord {
    pub pool_id: u64,
    pub amount_in_yocto: U128,
    pub min_amount_out: U128,
    pub token_out: AccountId,
}

/// Payload the guard forwards: JSON `{"pool_id":2896,"min_amount_out":"35000"}`.
/// Both fields optional — defaults come from the contract config.
#[near(serializers = [json])]
#[derive(Clone, Debug, Default)]
pub struct ExecutePayload {
    pub pool_id: Option<u64>,
    pub min_amount_out: Option<U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RefVenue {
    config: VenueConfig,
    swaps: u64,
    last_swap: Option<SwapRecord>,
}

#[near]
impl RefVenue {
    #[init]
    pub fn new(ref_exchange: Option<AccountId>, wnear: Option<AccountId>, usdc: Option<AccountId>, pool_id: Option<u64>) -> Self {
        Self {
            config: VenueConfig {
                ref_exchange: ref_exchange.unwrap_or_else(|| DEFAULT_REF_EXCHANGE.parse().unwrap()),
                wnear: wnear.unwrap_or_else(|| DEFAULT_WNEAR.parse().unwrap()),
                usdc: usdc.unwrap_or_else(|| DEFAULT_USDC.parse().unwrap()),
                pool_id: pool_id.unwrap_or(DEFAULT_POOL_ID),
            },
            swaps: 0,
            last_swap: None,
        }
    }

    pub fn get_config(&self) -> VenueConfig {
        self.config.clone()
    }

    /// Chain-read swap count (increments only on a completed swap).
    pub fn get_swaps(&self) -> u64 {
        self.swaps
    }

    pub fn get_last_swap(&self) -> Option<SwapRecord> {
        self.last_swap.clone()
    }

    /// The guard's entry point. Attached NEAR deposit is the swap size.
    /// Returns a promise: the guard settles iff the whole chain succeeds.
    #[payable]
    pub fn execute(&mut self, payload: String) -> Promise {
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "ref-venue: zero-deposit swap");
        let parsed: ExecutePayload =
            serde_json::from_str(&payload).unwrap_or_else(|_| env::panic_str("ref-venue: malformed payload"));
        let pool_id = parsed.pool_id.unwrap_or(self.config.pool_id);
        let min_out = parsed.min_amount_out.map(|m| m.0).unwrap_or(0);

        env::log_str(&format!(
            "ref-venue execute pool={pool_id} amount_in={attached} min_out={min_out}"
        ));

        // Hop 1: wrap the attached NEAR. Hop 2 (swap) runs in on_wrapped,
        // which only fires if the wrap succeeded.
        ext_wrap::ext(self.config.wnear.clone())
            .with_attached_deposit(env::attached_deposit())
            .with_static_gas(WRAP_GAS)
            .near_deposit()
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(WRAP_CALLBACK_GAS)
                    .on_wrapped(pool_id, U128(attached), U128(min_out)),
            )
            .into()
    }

    /// Hop 2: the wrap landed, so this contract now holds wNEAR. Swap it
    /// on Ref via ft_transfer_call. Private: only this contract may call it.
    #[private]
    pub fn on_wrapped(&mut self, pool_id: u64, amount_in: U128, min_amount_out: U128) -> Promise {
        if matches!(env::promise_result(0), PromiseResult::Failed) {
            env::panic_str("ref-venue: wrap failed");
        }
        let msg = serde_json::json!({
            "force": 0,
            "actions": [{
                "pool_id": pool_id,
                "token_in": self.config.wnear.to_string(),
                "token_out": self.config.usdc.to_string(),
                "amount_in": amount_in.0.to_string(),
                "min_amount_out": min_amount_out.0.to_string(),
            }]
        })
        .to_string();
        ext_wrap::ext(self.config.wnear.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(SWAP_GAS)
            .ft_transfer_call(self.config.ref_exchange.clone(), amount_in, None, msg)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(SWAP_CALLBACK_GAS)
                    .on_swapped(pool_id, amount_in, min_amount_out),
            )
            .into()
    }

    /// Bookkeeping + receipt. A failed swap panics here, so the guard's
    /// promise callback sees failure and EXPIRES the decision instead of
    /// settling it. Private: only this contract may call it.
    #[private]
    pub fn on_swapped(&mut self, pool_id: u64, amount_in: U128, min_amount_out: U128) -> String {
        if matches!(env::promise_result(0), PromiseResult::Failed) {
            env::panic_str("ref-venue: swap failed");
        }
        self.swaps += 1;
        self.last_swap = Some(SwapRecord {
            pool_id,
            amount_in_yocto: amount_in,
            min_amount_out,
            token_out: self.config.usdc.clone(),
        });
        format!(
            "{{\"status\":\"SWAPPED\",\"venue\":\"ref-finance-101.testnet\",\"pool_id\":{pool_id},\"amount_in_yocto\":\"{}\",\"min_amount_out\":\"{}\",\"token_out\":\"{}\",\"swaps\":{}}}",
            amount_in.0,
            min_amount_out.0,
            self.config.usdc,
            self.swaps
        )
    }
}

/// Pure helper, unit-tested: resolve payload overrides against config.
pub fn resolve_swap(pool_id: Option<u64>, min_out: Option<u128>, config_pool: u64) -> (u64, u128) {
    (pool_id.unwrap_or(config_pool), min_out.unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_when_payload_empty() {
        let (pool, min) = resolve_swap(None, None, DEFAULT_POOL_ID);
        assert_eq!(pool, 2896);
        assert_eq!(min, 0);
    }

    #[test]
    fn payload_overrides_win() {
        let (pool, min) = resolve_swap(Some(54), Some(35000), DEFAULT_POOL_ID);
        assert_eq!(pool, 54);
        assert_eq!(min, 35000);
    }

    #[test]
    fn payload_parses_from_guard_json() {
        let p: ExecutePayload =
            serde_json::from_str("{\"pool_id\":2896,\"min_amount_out\":\"35000\"}").unwrap();
        assert_eq!(p.pool_id, Some(2896));
        assert_eq!(p.min_amount_out, Some(U128(35000)));
    }

    #[test]
    fn empty_payload_object_parses_to_defaults() {
        let p: ExecutePayload = serde_json::from_str("{}").unwrap();
        assert_eq!(p.pool_id, None);
        assert_eq!(p.min_amount_out, None);
    }
}
