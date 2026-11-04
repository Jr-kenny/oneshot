//! Mock venue — deterministic downstream execution target for OneShot runs.
//!
//! `execute` is the method the guard forwards into. It always succeeds with a
//! deterministic fill receipt; chaos (delay / dropped acks / duplicate
//! signature paths) is injected by the harness at the SDK layer so both the
//! naive and guarded agents face identical conditions.

use near_sdk::{env, near, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockVenue { fills: u64 }

#[near]
impl MockVenue {
    #[init]
    pub fn new() -> Self {
        Self { fills: 0 }
    }
}

#[near]
impl MockVenue {
    /// Payload: JSON {asset, direction, slippage, decision_id}.
    /// Returns a fill receipt. Deliberately simple: the *guard* is the show.
    #[payable]
    pub fn execute(&mut self, payload: String) -> String {
        self.fills += 1;
        let amount = env::attached_deposit().as_yoctonear();
        env::log_str(&format!("venue executed payload={payload}"));
        format!(
            "{{\"status\":\"FILLED\",\"tx_id\":\"{}\",\"deposit\":\"{}\"}}",
            env::random_seed().iter().map(|b| format!("{b:02x}")).collect::<String>(),
            amount
        )
    }
}
