import React from 'react';
import { DecisionState } from '../types';
import { CheckCircle2, Clock, ShieldCheck, Database, Loader2, ArrowDown, ExternalLink } from 'lucide-react';

interface ExecutionLifecycleTimelineProps {
  decisionId: string;
  decisionState: DecisionState | 'NONE';
  consensusStatus: 'IDLE' | 'WAITING' | 'FINALIZED';
  isRunning: boolean;
  elapsed: number;
  decisionSize: number;
  resolutionVia?: string;
  resolutionTx?: string;
  inAir: number;
}

export const ExecutionLifecycleTimeline: React.FC<ExecutionLifecycleTimelineProps> = ({
  decisionId,
  decisionState,
  consensusStatus,
  isRunning,
  elapsed,
  decisionSize,
  resolutionVia,
  resolutionTx,
  inAir,
}) => {
  // Step progression logic:
  // Step 1: Proposed
  const step1Done = isRunning || decisionState !== 'NONE';
  const step1Active = isRunning && elapsed < 0.2;

  // Step 2: Validator Consensus
  const step2Done = (isRunning && elapsed >= 0.4) || decisionState === 'SETTLED';
  const step2Active = isRunning && consensusStatus === 'WAITING';

  // Step 3: On-Chain Recorded (Guard Atomic Hold)
  const step3Done = decisionState === 'SETTLED';
  const step3Active = decisionState === 'LIVE' && !step3Done;

  // Step 4: Finalized
  const step4Done = decisionState === 'SETTLED';
  const step4Active = isRunning && elapsed >= 3.0 && !step4Done;

  const steps = [
    {
      id: 'step-proposed',
      name: 'Proposed',
      label: 'Agent Intent Proposal',
      description: 'Agent computes content-derived identity from semantic trade parameters.',
      time: 'T+0.05s',
      isDone: step1Done,
      isActive: step1Active,
      badge: `ID: ${decisionId.slice(0, 10)}…`,
      details: `Asset: NEAR/USDC • Size: $${decisionSize} • Scoped key authorized`,
      icon: Database,
    },
    {
      id: 'step-consensus',
      name: 'Validator Consensus',
      label: 'Nightshade Shard Consensus',
      description: 'Transaction broadcasted to chunk producer and verified by validator set.',
      time: 'T+0.24s',
      isDone: step2Done,
      isActive: step2Active,
      badge: step2Active ? 'Waiting for consensus…' : 'Chunk #131894300 Finalized',
      details: step2Active
        ? 'Propagating through Nightshade Phase 2 chunk producer…'
        : 'Chunk finality achieved in 1.18s • 0 validator conflicts',
      icon: Clock,
    },
    {
      id: 'step-recorded',
      name: 'On-Chain Recorded',
      label: 'Guard Atomic Hold Placed',
      description: 'OneShot Guard contract registers decision and atomically locks in-air envelope spend.',
      time: 'T+0.45s',
      isDone: step3Done,
      isActive: step3Active,
      badge: step3Active ? `LIVE: $${inAir.toFixed(2)} Hold` : 'Reservation Confirmed',
      details: step3Active
        ? `Capital locked: $${inAir.toFixed(2)} in-air • All subsequent retries blocked`
        : 'Atomic envelope spend verified against global ceiling',
      icon: ShieldCheck,
    },
    {
      id: 'step-finalized',
      name: 'Finalized',
      label: 'Downstream Settlement Confirmed',
      description: 'Native promise callback received from venue. Exact-once execution resolved.',
      time: 'T+15.00s',
      isDone: step4Done,
      isActive: step4Active,
      badge: step4Done ? 'SETTLED' : 'Awaiting Proof',
      details: step4Done
        ? `Via ${resolutionVia || 'promise_callback'} • In-air exposure drained to $0`
        : 'Waiting for Rhea execution receipt or 1Click verifier ledger state…',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="w-full bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1F2733] text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#2BD576]" />
          <span className="text-[#E6EAF0] font-semibold uppercase tracking-wider">
            EXECUTION LIFECYCLE TIMELINE
          </span>
        </div>
        <span className="text-[11px] text-[#8A94A6]">
          {step4Done
            ? 'COMPLETED • EXACTLY-ONCE'
            : isRunning
            ? 'MONITORING TRANSITIONS'
            : 'STANDBY'}
        </span>
      </div>

      {/* Vertical Steps */}
      <div className="relative pl-6 space-y-6">
        {/* Continuous vertical timeline connector line */}
        <div className="absolute left-[17px] top-2 bottom-2 w-[1.5px] bg-[#1F2733]" />

        {steps.map((step, index) => {
          const StepIcon = step.icon;

          return (
            <div key={step.id} className="relative group">
              {/* Timeline node icon */}
              <div
                className={`absolute -left-[30px] top-0 w-6 h-6 rounded-full flex items-center justify-center border z-10 transition-colors ${
                  step.isDone
                    ? 'bg-[#151B25] border-[#2BD576] text-[#2BD576]'
                    : step.isActive
                    ? 'bg-[#151B25] border-[#F5A524] text-[#F5A524] shadow-[0_0_8px_rgba(245,165,36,0.4)]'
                    : 'bg-[#0A0E14] border-[#1F2733] text-[#5B6577]'
                }`}
              >
                {step.isActive ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <StepIcon size={12} />
                )}
              </div>

              {/* Step Content */}
              <div
                className={`p-3 rounded-[4px] border transition-colors ${
                  step.isActive
                    ? 'bg-[#151B25] border-[#F5A524]/60'
                    : step.isDone
                    ? 'bg-[#0A0E14] border-[#1F2733]'
                    : 'bg-[#0A0E14]/40 border-[#1F2733]/40'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold tracking-wide uppercase text-[11px] ${
                        step.isDone
                          ? 'text-[#2BD576]'
                          : step.isActive
                          ? 'text-[#F5A524]'
                          : 'text-[#8A94A6]'
                      }`}
                    >
                      {index + 1}. {step.name}
                    </span>
                    <span className="text-[#1F2733]">•</span>
                    <span className="text-[#E6EAF0] text-[11px]">{step.label}</span>
                  </div>
                  <span className="text-[10px] text-[#5B6577]">{step.time}</span>
                </div>

                <p className="text-[11px] text-[#8A94A6] leading-relaxed mb-2">
                  {step.description}
                </p>

                {/* Sub-details & badge */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono pt-2 border-t border-[#1F2733]/60">
                  <span className="text-[#8A94A6]">{step.details}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold ${
                      step.isDone
                        ? 'bg-[#2BD576]/10 text-[#2BD576] border border-[#2BD576]/30'
                        : step.isActive
                        ? 'bg-[#F5A524]/10 text-[#F5A524] border border-[#F5A524]/30'
                        : 'bg-[#151B25] text-[#5B6577]'
                    }`}
                  >
                    {step.badge}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Explorer info if finalized */}
      {step4Done && resolutionTx && (
        <div className="mt-4 pt-3 border-t border-[#1F2733] flex items-center justify-between text-[11px] font-mono text-[#8A94A6]">
          <span>Settlement Transaction:</span>
          <a
            href={`https://nearblocks.io/txns/${resolutionTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#2BD576] hover:underline"
          >
            <span>{resolutionTx.slice(0, 10)}…{resolutionTx.slice(-6)}</span>
            <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  );
};
