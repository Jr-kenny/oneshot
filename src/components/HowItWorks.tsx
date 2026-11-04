import React, { useState, useEffect } from 'react';
import { ReservationBar } from './ReservationBar';
import { ArrowRight, ShieldCheck, Database, KeyRound, Gauge } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const [packetProgress, setPacketProgress] = useState(0); // 0 to 100%

  useEffect(() => {
    const interval = setInterval(() => {
      setPacketProgress((prev) => (prev + 1.2) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  const isLive = packetProgress >= 25 && packetProgress < 80;
  const isSettled = packetProgress >= 80;

  return (
    <div className="w-full bg-[#0A0E14] text-[#E6EAF0] py-12 px-4 sm:px-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-2">
            ARCHITECTURE & SETTLEMENT ENFORCEMENT
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#E6EAF0] mb-3">
            How it works
          </h1>
          <p className="text-base text-[#8A94A6] max-w-[700px] leading-relaxed">
            Execution integrity is enforced at the contract settlement layer on NEAR. The agent cannot bypass the guard because its scoped access key only allows calling execute_decision.
          </p>
        </div>

        {/* ================= DIAGRAM A: THE GUARD LOOP ================= */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 mb-12">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6]">
              DIAGRAM A: THE GUARD EXECUTION LOOP
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-[#8A94A6]">STATE:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isSettled
                    ? 'bg-[#2BD576]/20 text-[#2BD576] border border-[#2BD576]/30'
                    : isLive
                    ? 'bg-[#F5A524]/20 text-[#F5A524] border border-[#F5A524]/30'
                    : 'bg-[#151B25] text-[#8A94A6]'
                }`}
              >
                {isSettled ? 'SETTLED' : isLive ? 'LIVE' : 'IDLE'}
              </span>
            </div>
          </div>

          {/* Reservation Bar Active in diagram */}
          <div className="mb-6 max-w-[600px]">
            <ReservationBar
              inAir={isLive ? 500 : 0}
              ceiling={500}
              state={isSettled ? 'SETTLED' : isLive ? 'LIVE' : 'IDLE'}
              size="md"
            />
          </div>

          {/* SVG Diagram Canvas */}
          <div className="relative w-full overflow-x-auto min-w-[720px] py-6">
            <svg viewBox="0 0 860 210" className="w-full h-auto text-xs font-mono select-none">
              {/* Connecting line */}
              <line x1="80" y1="90" x2="780" y2="90" stroke="#1F2733" strokeWidth="2" strokeDasharray="4 4" />

              {/* Node 1: Agent */}
              <g transform="translate(30, 50)">
                <rect width="110" height="80" rx="4" fill="#151B25" stroke="#1F2733" strokeWidth="1" />
                <text x="55" y="30" fill="#8A94A6" textAnchor="middle" fontSize="10" letterSpacing="0.06em">ACTOR</text>
                <text x="55" y="48" fill="#E6EAF0" textAnchor="middle" fontWeight="bold" fontSize="12">AI Agent</text>
                <text x="55" y="65" fill="#5B6577" textAnchor="middle" fontSize="9">Scoped key</text>
              </g>

              {/* Arrow to Guard */}
              <path d="M 145 90 L 210 90" stroke="#8A94A6" strokeWidth="1.5" markerEnd="url(#arrow)" />

              {/* Node 2: Guard Contract (execute_decision) */}
              <g transform="translate(215, 25)">
                <rect width="250" height="130" rx="6" fill="#0A0E14" stroke="#F5A524" strokeWidth="1.5" />
                <rect x="0" y="0" width="250" height="26" fill="#151B25" rx="4" />
                <text x="125" y="17" fill="#F5A524" textAnchor="middle" fontWeight="bold" fontSize="11" letterSpacing="0.06em">
                  GUARD CONTRACT (execute_decision)
                </text>

                {/* 3 labelled inner parts */}
                <rect x="12" y="38" width="68" height="72" rx="3" fill="#151B25" stroke="#1F2733" />
                <text x="46" y="65" fill="#8A94A6" textAnchor="middle" fontSize="9">Decision</text>
                <text x="46" y="80" fill="#E6EAF0" textAnchor="middle" fontSize="9">Registry</text>

                <rect x="90" y="38" width="70" height="72" rx="3" fill="#151B25" stroke="#1F2733" />
                <text x="125" y="65" fill="#8A94A6" textAnchor="middle" fontSize="9">Reservation</text>
                <text x="125" y="80" fill="#F5A524" textAnchor="middle" fontSize="9">Engine</text>

                <rect x="170" y="38" width="68" height="72" rx="3" fill="#151B25" stroke="#1F2733" />
                <text x="204" y="65" fill="#8A94A6" textAnchor="middle" fontSize="9">Callback</text>
                <text x="204" y="80" fill="#2BD576" textAnchor="middle" fontSize="9">Resolver</text>
              </g>

              {/* Arrow to Venue */}
              <path d="M 470 90 L 530 90" stroke="#8A94A6" strokeWidth="1.5" markerEnd="url(#arrow)" />

              {/* Node 3: Venue */}
              <g transform="translate(535, 50)">
                <rect width="110" height="80" rx="4" fill="#151B25" stroke="#1F2733" strokeWidth="1" />
                <text x="55" y="30" fill="#8A94A6" textAnchor="middle" fontSize="10" letterSpacing="0.06em">EXECUTION</text>
                <text x="55" y="48" fill="#E6EAF0" textAnchor="middle" fontWeight="bold" fontSize="12">Venue</text>
                <text x="55" y="65" fill="#5B6577" textAnchor="middle" fontSize="9">Rhea / Intents</text>
              </g>

              {/* Loopback Arrow: Callback to Guard */}
              <path
                d="M 590 135 C 590 185, 340 185, 340 160"
                fill="none"
                stroke="#2BD576"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text x="465" y="195" fill="#2BD576" textAnchor="middle" fontSize="10">
                NEAR Promise Callback (evidence)
              </text>

              {/* Node 4: Lifecycle Outcome */}
              <g transform="translate(700, 50)">
                <rect width="130" height="80" rx="4" fill="#151B25" stroke="#1F2733" strokeWidth="1" />
                <text x="65" y="30" fill="#8A94A6" textAnchor="middle" fontSize="10" letterSpacing="0.06em">OUTCOME</text>
                <text x="65" y="48" fill={isSettled ? '#2BD576' : isLive ? '#F5A524' : '#8A94A6'} textAnchor="middle" fontWeight="bold" fontSize="12">
                  {isSettled ? 'SETTLED' : isLive ? 'LIVE' : 'EXPIRED'}
                </text>
                <text x="65" y="65" fill="#8A94A6" textAnchor="middle" fontSize="9">Exactly-once</text>
              </g>

              {/* Animated travelling packet along path */}
              <circle
                cx={75 + packetProgress * 6.5}
                cy={90}
                r="4"
                fill={isSettled ? '#2BD576' : isLive ? '#F5A524' : '#E6EAF0'}
                className="transition-all"
              />

              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#8A94A6" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>

        {/* ================= DIAGRAM B: TWO ORACLES, ONE LIFECYCLE ================= */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 mb-12">
          <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-6">
            DIAGRAM B: TWO ORACLES, ONE UNIFIED LIFECYCLE
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            {/* Row 1: Direct NEAR Execution (Rhea) */}
            <div className="bg-[#0A0E14] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono text-[#F5A524] uppercase tracking-wider font-semibold">
                    VENUE: RHEA (DIRECT GUARD)
                  </span>
                  <span className="text-[10px] font-mono text-[#8A94A6]">v1.rhea-exchange.near</span>
                </div>
                <h3 className="text-base font-semibold text-[#E6EAF0] mb-2">
                  Native Promise Callbacks
                </h3>
                <p className="text-xs text-[#8A94A6] leading-relaxed mb-4">
                  Every spend routes through the OneShot guard contract. NEAR's native asynchronous promise callbacks mean the guard contract itself receives the downstream result on-chain.
                </p>
              </div>
              <div className="pt-3 border-t border-[#1F2733] text-xs font-mono text-[#2BD576]">
                "No oracle. No indexer. No guessing."
              </div>
            </div>

            {/* Row 2: NEAR Intents */}
            <div className="bg-[#0A0E14] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono text-[#2BD576] uppercase tracking-wider font-semibold">
                    VENUE: NEAR INTENTS
                  </span>
                  <span className="text-[10px] font-mono text-[#8A94A6]">intents.near</span>
                </div>
                <h3 className="text-base font-semibold text-[#E6EAF0] mb-2">
                  Verifier Ledger + 1Click Status
                </h3>
                <p className="text-xs text-[#8A94A6] leading-relaxed mb-4">
                  Settlement status is read from the 1Click execution status plus verifier ledger state. If a deadline passes without settlement on the verifier ledger, the decision is provably EXPIRED.
                </p>
              </div>
              <div className="pt-3 border-t border-[#1F2733] text-xs font-mono text-[#2BD576]">
                "Deadline passed without settlement means provably EXPIRED, so a retry is genuinely safe."
              </div>
            </div>
          </div>
        </div>

        {/* ================= COMPACT THREE ITEM ROW ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Item 1 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5">
            <div className="flex items-center gap-2 mb-3 text-[#E6EAF0]">
              <Database size={16} />
              <h4 className="text-sm font-semibold">Decision-bound identity</h4>
            </div>
            <p className="text-xs text-[#8A94A6] leading-relaxed">
              Hash of agent account, asset, size, direction, slippage bounds, and expiry. Because the identity belongs to the economic decision rather than the transaction bytes, replay, gas bump, and rerun all collapse to the same identity.
            </p>
          </div>

          {/* Item 2 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5">
            <div className="flex items-center gap-2 mb-3 text-[#E6EAF0]">
              <Gauge size={16} />
              <h4 className="text-sm font-semibold">Global in-flight ceiling</h4>
            </div>
            <p className="text-xs text-[#8A94A6] leading-relaxed">
              Reserved atomically across all of an agent's decisions. Dedup is the convenience; the ceiling is the guarantee. Even a broken agent generating novel decisions cannot exceed its in-flight allocation.
            </p>
          </div>

          {/* Item 3 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5">
            <div className="flex items-center gap-2 mb-3 text-[#E6EAF0]">
              <KeyRound size={16} />
              <h4 className="text-sm font-semibold">Scoped access key</h4>
            </div>
            <p className="text-xs text-[#8A94A6] leading-relaxed">
              The agent's private key is a function-call access key scoped strictly to <code className="text-[#E6EAF0] bg-[#151B25] px-1 py-0.5 rounded">execute_decision</code> on the guard contract. Direct bypass is cryptographically impossible at the account level.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
