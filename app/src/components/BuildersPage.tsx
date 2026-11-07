import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, ExternalLink, ShieldCheck, Terminal, Folder, FileCode, CheckCircle2 } from 'lucide-react';
import { CONTRACT_ADDRESS } from '../lib/simulationEngine';

export const BuildersPage: React.FC = () => {
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({
    contract: true,
    sdk: true,
    demo: true,
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMap((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  const CodeSnippet = ({ id, language, code }: { id: string; language: string; code: string }) => (
    <div className="relative my-4 rounded-[6px] border border-[#1F2733] bg-[#0F141C] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#151B25] border-b border-[#1F2733] text-[11px] font-mono text-[#8A94A6]">
        <span>{language}</span>
        <button
          onClick={() => handleCopy(id, code)}
          className="flex items-center gap-1 hover:text-[#E6EAF0] transition-colors focus:outline-none"
          aria-label={`Copy ${language} code snippet`}
        >
          {copiedMap[id] ? (
            <>
              <Check size={12} className="text-[#2BD576]" />
              <span className="text-[#2BD576]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-[#E6EAF0] overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="w-full bg-[#0A0E14] text-[#E6EAF0] py-12 px-4 sm:px-6">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row gap-12">
        {/* Left Sticky Table of Contents */}
        <aside className="w-full md:w-56 flex-shrink-0 md:sticky md:top-20 self-start text-xs font-mono">
          <div className="text-[11px] uppercase tracking-[0.06em] text-[#8A94A6] mb-4">
            DOCUMENTATION
          </div>
          <nav className="flex flex-col space-y-2 border-l border-[#1F2733] pl-3" aria-label="Documentation Table of Contents">
            <a href="#quickstart" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              Quickstart
            </a>
            <a href="#sdk-surface" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              SDK Surface
            </a>
            <a href="#architecture" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              Repository Architecture
            </a>
            <a href="#contract" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              Contract Deployment
            </a>
            <a href="#security-model" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              Security Model
            </a>
            <a href="#roadmap" className="text-[#8A94A6] hover:text-[#E6EAF0] transition-colors">
              Roadmap (Chain Signatures)
            </a>
          </nav>
        </aside>

        {/* Right Main Content (Max 760px) */}
        <main className="max-w-[760px] flex-1 min-w-0">
          {/* Header */}
          <div className="mb-8">
            <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-2">
              BUILDER REFERENCE
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#E6EAF0] mb-3">
              OneShot Developer Documentation
            </h1>
            <p className="text-sm text-[#8A94A6] leading-relaxed">
              Drop-in execution integrity for AI trading and liquidity agents on NEAR Protocol. Prevent retry duplication and catastrophic exposure overruns at the settlement layer.
            </p>
          </div>

          {/* SECTION 1: QUICKSTART */}
          <section id="quickstart" className="mb-12 pt-4">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">Quickstart</h2>
            <p className="text-sm text-[#8A94A6] mb-3 leading-relaxed">
              Install the OneShot TypeScript SDK via npm:
            </p>

            <CodeSnippet
              id="install-sdk"
              language="bash"
              code="npm install @oneshot-guard/sdk"
            />

            <p className="text-sm text-[#8A94A6] mb-2 leading-relaxed">
              Wrap your existing trading agent in three lines of code:
            </p>

            <CodeSnippet
              id="quickstart-wrap"
              language="typescript"
              code={`import { wrapAgentWithOneShot } from '@oneshot-guard/sdk';

// Wrap your raw NEAR account or intent dispatcher
const guardedAgent = wrapAgentWithOneShot(agentAccount, {
  guardContract: 'oneshot-guard.testnet',
  maxInFlightCeiling: 1000, // $1,000 maximum atomic exposure
});

// All trades now execute with guaranteed exactly-once idempotency
const result = await guardedAgent.executeDecision({
  asset: 'NEAR/USDC',
  size: 500,
  direction: 'BUY',
  slippageTolerance: 0.005,
  expirySec: 60,
});`}
            />
          </section>

          {/* SECTION 2: SDK SURFACE */}
          <section id="sdk-surface" className="mb-12 pt-4 border-t border-[#1F2733]">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">SDK Surface</h2>
            <p className="text-sm text-[#8A94A6] mb-4 leading-relaxed">
              The SDK exposes three primary methods: <code className="text-[#E6EAF0] font-mono text-xs">wrapAgentWithOneShot</code>, <code className="text-[#E6EAF0] font-mono text-xs">execute_decision</code>, and <code className="text-[#E6EAF0] font-mono text-xs">check_decision</code>.
            </p>

            {/* Method 1 */}
            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-4 mb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold font-mono text-[#E6EAF0]">
                  execute_decision(params: DecisionParams): Promise&lt;ExecutionResult&gt;
                </h3>
              </div>
              <p className="text-xs text-[#8A94A6] mb-2 leading-relaxed">
                Computes the deterministic content-bound identity and dispatches the intent through the guard contract. Atomically acquires the reservation before venue routing.
              </p>
              <CodeSnippet
                id="method-execute"
                language="typescript"
                code={`const res = await sdk.execute_decision({
  asset: 'NEAR/USDC',
  size: 500,
  direction: 'BUY',
  slippageTolerance: 0.005,
  expirySec: 45
});
// If another attempt is already LIVE, rejects with:
// Error: [ONESHOT_GUARD] Decision 0x9f3a...c21e is LIVE. Retry blocked.`}
              />
            </div>

            {/* Method 2 */}
            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-4 mb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold font-mono text-[#E6EAF0]">
                  check_decision(decisionId: string): Promise&lt;DecisionStatus&gt;
                </h3>
              </div>
              <p className="text-xs text-[#8A94A6] mb-2 leading-relaxed">
                Queries the on-chain registry for current lifecycle state (<code className="text-[#F5A524] font-mono">LIVE</code>, <code className="text-[#2BD576] font-mono">SETTLED</code>, <code className="text-[#5B6577] font-mono">EXPIRED</code>), reserved budget, and settlement transaction hash.
              </p>
              <CodeSnippet
                id="method-check"
                language="typescript"
                code={`const status = await sdk.check_decision('0x9f3a8b41e05d2c73');
console.log(status);
// { state: 'SETTLED', inAir: 0, tx: '0x7b4ae1298fc3d014', via: 'promise_callback' }`}
              />
            </div>

            {/* Method 3 */}
            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold font-mono text-[#E6EAF0]">
                  wrapAgentWithOneShot(account: Account, config: GuardConfig): GuardedAgent
                </h3>
              </div>
              <p className="text-xs text-[#8A94A6] mb-2 leading-relaxed">
                Drop-in wrapper establishing the function-call access key boundaries, automatic decision hashing, and promise-callback monitoring.
              </p>
            </div>
          </section>

          {/* SECTION 3: REPO ARCHITECTURE */}
          <section id="architecture" className="mb-12 pt-4 border-t border-[#1F2733]">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">Repository Architecture</h2>
            <p className="text-sm text-[#8A94A6] mb-4 leading-relaxed">
              The OneShot mono-repository is structured into modular Rust smart contracts, client SDK, chaos simulation harness, and verification stream:
            </p>

            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-4 font-mono text-xs text-[#8A94A6]">
              {/* Root */}
              <div className="flex items-center gap-1.5 text-[#E6EAF0] font-semibold mb-2">
                <Folder size={14} className="text-[#F5A524]" />
                <span>oneshot/</span>
              </div>

              {/* contract */}
              <div className="ml-4 mb-2">
                <button
                  onClick={() => setTreeExpanded({ ...treeExpanded, contract: !treeExpanded.contract })}
                  className="flex items-center gap-1.5 text-[#E6EAF0] hover:text-white"
                >
                  {treeExpanded.contract ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Folder size={13} className="text-[#8A94A6]" />
                  <span>contract/</span>
                  <span className="text-[10px] text-[#5B6577] ml-2"># Rust guard contract</span>
                </button>
                {treeExpanded.contract && (
                  <div className="ml-6 mt-1 space-y-1 text-[#8A94A6]">
                    <div>├── src/registry.rs  # Decision registry & state machine</div>
                    <div>├── src/reservation.rs  # Global ceiling & envelope spend</div>
                    <div>├── src/callback.rs  # NEAR promise-callback resolution</div>
                    <div>└── src/lib.rs  # execute_decision() & access key guards</div>
                  </div>
                )}
              </div>

              {/* sdk */}
              <div className="ml-4 mb-2">
                <button
                  onClick={() => setTreeExpanded({ ...treeExpanded, sdk: !treeExpanded.sdk })}
                  className="flex items-center gap-1.5 text-[#E6EAF0] hover:text-white"
                >
                  {treeExpanded.sdk ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Folder size={13} className="text-[#8A94A6]" />
                  <span>sdk/</span>
                  <span className="text-[10px] text-[#5B6577] ml-2"># TypeScript client wrapper</span>
                </button>
                {treeExpanded.sdk && (
                  <div className="ml-6 mt-1 space-y-1 text-[#8A94A6]">
                    <div>├── src/client.ts  # execute_decision & check_decision</div>
                    <div>├── src/hasher.ts  # Content-bound semantic decision hashing</div>
                    <div>└── src/index.ts</div>
                  </div>
                )}
              </div>

              {/* demo */}
              <div className="ml-4 mb-2">
                <button
                  onClick={() => setTreeExpanded({ ...treeExpanded, demo: !treeExpanded.demo })}
                  className="flex items-center gap-1.5 text-[#E6EAF0] hover:text-white"
                >
                  {treeExpanded.demo ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <Folder size={13} className="text-[#8A94A6]" />
                  <span>demo/</span>
                  <span className="text-[10px] text-[#5B6577] ml-2"># Chaos test harness</span>
                </button>
                {treeExpanded.demo && (
                  <div className="ml-6 mt-1 space-y-1 text-[#8A94A6]">
                    <div>├── naive-agent/  # Unprotected agent: retries on timeout</div>
                    <div>├── guarded-agent/  # OneShot SDK protected agent</div>
                    <div>└── chaos-proxy/  # Executes trade, swallows ack (the villain)</div>
                  </div>
                )}
              </div>

              {/* api */}
              <div className="ml-4 mb-1">
                <div className="flex items-center gap-1.5 text-[#E6EAF0]">
                  <Folder size={13} className="text-[#8A94A6]" />
                  <span>api/</span>
                  <span className="text-[10px] text-[#5B6577] ml-2"># WebSocket event streamer & verifier</span>
                </div>
              </div>

              {/* site */}
              <div className="ml-4">
                <div className="flex items-center gap-1.5 text-[#E6EAF0]">
                  <Folder size={13} className="text-[#8A94A6]" />
                  <span>site/</span>
                  <span className="text-[10px] text-[#5B6577] ml-2"># Demonstration console</span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: CONTRACT DEPLOYMENT */}
          <section id="contract" className="mb-12 pt-4 border-t border-[#1F2733]">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">Contract Deployment</h2>
            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <span className="text-[10px] uppercase text-[#8A94A6] block">Contract Address</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[#E6EAF0] font-semibold">{CONTRACT_ADDRESS}</span>
                    <button
                      onClick={() => handleCopy('contract', CONTRACT_ADDRESS)}
                      className="p-1 hover:text-[#E6EAF0] text-[#8A94A6]"
                      aria-label="Copy contract address"
                    >
                      {copiedMap['contract'] ? <Check size={12} className="text-[#2BD576]" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase text-[#8A94A6] block">Network</span>
                  <span className="text-[#2BD576] font-semibold mt-1 inline-block">NEAR Mainnet</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase text-[#8A94A6] block">Status</span>
                  <div className="flex items-center gap-1.5 text-[#2BD576] mt-1">
                    <CheckCircle2 size={13} />
                    <span>Verified on NEAR Explorer</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase text-[#8A94A6] block">Explorer Link</span>
                  <a
                    href="https://nearblocks.io/address/oneshot-guard.testnet"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[#E6EAF0] hover:underline mt-1"
                  >
                    <span>View on NearBlocks</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5: SECURITY MODEL */}
          <section id="security-model" className="mb-12 pt-4 border-t border-[#1F2733]">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">Security Model</h2>
            <p className="text-sm text-[#8A94A6] mb-4 leading-relaxed">
              We state what is cryptographically enforced versus what is cooperative with complete honesty.
            </p>

            <div className="border border-[#1F2733] rounded-[6px] overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-[#151B25] border-b border-[#1F2733] text-[#8A94A6] uppercase tracking-wider">
                    <th className="p-3 w-1/2">Enforced On-Chain</th>
                    <th className="p-3 w-1/2">Cooperative / Off-Chain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2733]/60 bg-[#0F141C]">
                  <tr>
                    <td className="p-3 text-[#E6EAF0] align-top">
                      <strong className="text-[#2BD576] block mb-1">State machine transitions</strong>
                      A decision marked LIVE cannot be re-executed until EXPIRED or SETTLED.
                    </td>
                    <td className="p-3 text-[#8A94A6] align-top">
                      <strong className="text-[#8A94A6] block mb-1">Decision semantic extraction</strong>
                      Extracting slippage bounds and asset pairs from the agent's LLM prompt relies on SDK hashing logic.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[#E6EAF0] align-top">
                      <strong className="text-[#2BD576] block mb-1">In-flight capital ceiling</strong>
                      Total atomic reservation cannot exceed the pre-configured envelope ceiling.
                    </td>
                    <td className="p-3 text-[#8A94A6] align-top">
                      <strong className="text-[#8A94A6] block mb-1">Key rotation hygiene</strong>
                      The agent owner must grant only a scoped function-call key to the guard, not a full-access key.
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-[#E6EAF0] align-top">
                      <strong className="text-[#2BD576] block mb-1">Account-level bypass prevention</strong>
                      Scoped function-call keys cannot call venue contracts directly without going through the guard.
                    </td>
                    <td className="p-3 text-[#8A94A6] align-top">
                      <strong className="text-[#8A94A6] block mb-1">Offline clock synchronization</strong>
                      Expiry timestamps use NEAR block timestamps, avoiding local system clock skew vulnerabilities.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 6: ROADMAP */}
          <section id="roadmap" className="mb-12 pt-4 border-t border-[#1F2733]">
            <h2 className="text-xl font-semibold text-[#E6EAF0] mb-2">Roadmap</h2>
            <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded bg-[#F5A524]/20 text-[#F5A524] text-[10px] font-mono font-bold uppercase tracking-wider">
                  Upcoming
                </span>
                <h3 className="text-base font-semibold text-[#E6EAF0]">
                  NEAR Chain Signatures Integration
                </h3>
              </div>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                One guard for every chain an agent touches. Leveraging NEAR MPC Chain Signatures, OneShot will issue threshold signatures for Ethereum, Solana, and Bitcoin execution only after the NEAR guard confirms reservation and exactly-once state. Cross-chain retry duplication is eliminated uniformly.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
