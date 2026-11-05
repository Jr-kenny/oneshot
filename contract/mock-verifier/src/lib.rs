//! OneShot mock verifier — TESTNET/SANDBOX STAND-IN ONLY, NOT intents.near.
//!
//! Copies the *shape* of the real NEAR Intents verifier that OneShot's
//! adapter needs, so the adapter can be proven end to end for $0:
//!   - a nonce, once published, can never be published again (replay blocked)
//!   - an intent is LIVE until it settles or its deadline passes
//!   - after its deadline, an unsettled intent is EXPIRED (provably dead)
//!   - current_salt is readable, so the adapter builds nonces the same way
//!     it would for the real verifier (salt || unique bytes).
//!
//! It does NOT do real cross-chain settlement, does NOT check NEP-413
//! signatures, and must never be presented as intents.near. In production
//! the adapter points at intents.near on mainnet and this contract is
//! replaced, not reused.

use near_sdk::store::UnorderedMap;
use near_sdk::{env, near, require, PanicOnDefault};

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntentState {
    Live,
    Settled,
    Expired,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct IntentRecord {
    pub signer: String,
    pub deadline_ms: u64,
    pub settled: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockVerifier {
    nonces: UnorderedMap<String, IntentRecord>,
    salt: [u8; 4],
}

#[near]
impl MockVerifier {
    #[init]
    pub fn new(salt: Option<String>) -> Self {
        // Salt is 4 bytes, hex-encoded for the JSON init arg, e.g. "01020304".
        let salt_bytes = salt
            .and_then(|s| hex_decode(&s))
            .filter(|b| b.len() == 4)
            .map(|b| [b[0], b[1], b[2], b[3]])
            .unwrap_or([0, 0, 0, 1]);
        Self { nonces: UnorderedMap::new(b"n"), salt: salt_bytes }
    }

    pub fn current_salt(&self) -> String {
        hex_encode(&self.salt)
    }

    /// Publish an intent. Panics on a reused nonce — the replay guard.
    pub fn publish_intent(&mut self, nonce: String, signer: String, deadline_ms: u64) {
        require!(!self.nonces.contains_key(&nonce), "MOCK-VERIFIER: nonce already used");
        self.nonces.insert(nonce, IntentRecord { signer, deadline_ms, settled: false });
    }

    /// Settle a live intent. In the real system a solver does this by
    /// executing the trade; here the test harness calls it to prove the
    /// adapter's SETTLED mapping, not to prove a real trade.
    pub fn settle(&mut self, nonce: String) {
        let mut rec = self.nonces.get(&nonce).cloned().unwrap_or_else(|| env::panic_str("MOCK-VERIFIER: unknown nonce"));
        require!(!rec.settled, "MOCK-VERIFIER: already settled");
        require!(env::block_timestamp_ms() < rec.deadline_ms, "MOCK-VERIFIER: intent expired");
        rec.settled = true;
        self.nonces.insert(nonce, rec);
    }

    /// The oracle read the adapter uses. No "is nonce used?" shortcut is
    /// hidden here: status is derived from stored state + deadline, exactly
    /// the way the real adapter must derive it from relay status + deadline.
    pub fn get_status(&self, nonce: String) -> Option<IntentState> {
        let rec = self.nonces.get(&nonce)?;
        if rec.settled {
            Some(IntentState::Settled)
        } else if env::block_timestamp_ms() >= rec.deadline_ms {
            Some(IntentState::Expired)
        } else {
            Some(IntentState::Live)
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let b = s.as_bytes();
    for i in (0..b.len()).step_by(2) {
        let hi = (b[i] as char).to_digit(16)?;
        let lo = (b[i + 1] as char).to_digit(16)?;
        out.push(((hi << 4) | lo) as u8);
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, AccountId};

    fn ctx(ts_ms: u64) -> VMContextBuilder {
        let mut c = VMContextBuilder::new();
        c.current_account_id("mock.testnet".parse::<AccountId>().unwrap())
            .block_timestamp(ts_ms * 1_000_000);
        c
    }

    #[test]
    fn publish_then_live_then_settled() {
        testing_env!(ctx(1_000).build());
        let mut v = MockVerifier::new(Some("01020304".to_string()));
        v.publish_intent("nonce-1".to_string(), "agent.testnet".to_string(), 2_000);
        assert_eq!(v.get_status("nonce-1".to_string()), Some(IntentState::Live));
        v.settle("nonce-1".to_string());
        assert_eq!(v.get_status("nonce-1".to_string()), Some(IntentState::Settled));
    }

    #[test]
    #[should_panic(expected = "nonce already used")]
    fn reused_nonce_is_blocked() {
        testing_env!(ctx(1_000).build());
        let mut v = MockVerifier::new(None);
        v.publish_intent("nonce-1".to_string(), "agent.testnet".to_string(), 9_999);
        v.publish_intent("nonce-1".to_string(), "agent.testnet".to_string(), 9_999);
    }

    #[test]
    fn past_deadline_unsettled_is_expired() {
        testing_env!(ctx(1_000).build());
        let mut v = MockVerifier::new(None);
        v.publish_intent("nonce-9".to_string(), "agent.testnet".to_string(), 2_000);
        testing_env!(ctx(3_000).build());
        assert_eq!(v.get_status("nonce-9".to_string()), Some(IntentState::Expired));
    }

    #[test]
    fn unknown_nonce_is_none_not_a_state() {
        testing_env!(ctx(1_000).build());
        let v = MockVerifier::new(None);
        assert_eq!(v.get_status("nope".to_string()), None);
    }

    #[test]
    fn salt_is_readable_and_stable() {
        testing_env!(ctx(1_000).build());
        let v = MockVerifier::new(Some("aabbccdd".to_string()));
        assert_eq!(v.current_salt(), "aabbccdd");
    }
}
