import React from 'react';
import { UncertaintyAnimation } from './UncertaintyAnimation';
import { ReservationBar } from './ReservationBar';
import { ArrowRight, ShieldCheck, Lock, Activity, EyeOff, Hash, Layers, RefreshCw, Cpu } from 'lucide-react';

interface LandingPageProps {
  onNavigate: (route: string) => void;
  onStartDemoRun: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onStartDemoRun }) => {
  const handleRunDemo = () => {
    onNavigate('/demo');
    setTimeout(() => onStartDemoRun(), 50);
  };

  const scrollToMechanism = () => {
    const el = document.getElementById('mechanism-teaser');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      onNavigate('/how-it-works');
    }
  };

  return (
    <div className="w-full bg-[#0A0E14] text-[#E6EAF0]">
      {/* 5.1 HERO SECTION */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 md:pt-20 pb-8">
        <div className="max-w-[840px]">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.02em] leading-[1.1] text-[#E6EAF0] mb-6">
            One decision. One shot.
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl font-normal text-[#8A94A6] leading-relaxed mb-8">
            Ambiguous execution is how approved agents multiply trades. OneShot makes decision execution exactly-once, enforced on-chain.
          </p>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleRunDemo}
              className="px-6 py-3 bg-[#E6EAF0] text-[#0A0E14] font-semibold text-sm rounded-[4px] hover:bg-white active:bg-gray-200 transition-colors cursor-pointer select-none"
            >
              Run chaos demo
            </button>
            <button
              onClick={scrollToMechanism}
              className="px-6 py-3 bg-transparent text-[#E6EAF0] border border-[#1F2733] hover:border-[#8A94A6] font-semibold text-sm rounded-[4px] transition-colors cursor-pointer select-none"
            >
              Read the mechanism
            </button>
          </div>
        </div>

        {/* Uncertainty Window Animation */}
        <UncertaintyAnimation />

        {/* Card network hold callout strip */}
        <div className="border border-[#1F2733] bg-[#0F141C] p-4 rounded-[6px] text-sm md:text-base text-[#8A94A6] leading-relaxed">
          <span className="text-[#E6EAF0] font-medium">A card network places a hold on your funds the moment you commit.</span> The money is yours, but it is not available until capture or release. OneShot is that hold, for AI agents, on-chain.
        </div>
      </section>

      {/* 5.2 THE PROBLEM IN THREE CARDS */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 border-t border-[#1F2733]">
        <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-8">
          EXECUTION INTEGRITY DEFICIT
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 01 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono text-[#8A94A6] tracking-wider block mb-3">
                01
              </span>
              <h3 className="text-lg font-semibold text-[#E6EAF0] mb-2 leading-snug">
                Three retry classes, none binary-catchable.
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Replay, a gas or deadline bump, or a whole new decision loop with fresh prices. Nonces, tx hashes and idempotency keys each catch one of the three.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1F2733]/60 text-[11px] font-mono text-[#5B6577] uppercase tracking-wider">
              Transaction bytes != Economic intent
            </div>
          </div>

          {/* Card 02 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono text-[#8A94A6] tracking-wider block mb-3">
                02
              </span>
              <h3 className="text-lg font-semibold text-[#E6EAF0] mb-2 leading-snug">
                The isolated-approval trap.
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                Every retry passes its own check. Five valid retries is $2,500 against a $500 authorization.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1F2733]/60 text-[11px] font-mono text-[#FF5A36] uppercase tracking-wider">
              Per-tx limits cannot see cumulative spend
            </div>
          </div>

          {/* Card 03 */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 flex flex-col justify-between">
            <div>
              <span className="text-xs font-mono text-[#8A94A6] tracking-wider block mb-3">
                03
              </span>
              <h3 className="text-lg font-semibold text-[#E6EAF0] mb-2 leading-snug">
                Unknown is the most expensive state.
              </h3>
              <p className="text-sm text-[#8A94A6] leading-relaxed">
                The chain says happened or did not. The agent lives in the spectrum between. Nobody owns the gap.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[#1F2733]/60 text-[11px] font-mono text-[#F5A524] uppercase tracking-wider">
              Agents guess with capital
            </div>
          </div>
        </div>

        {/* Centered line */}
        <div className="my-16 text-center max-w-[880px] mx-auto">
          <p className="text-xl sm:text-2xl font-medium text-[#E6EAF0] leading-snug">
            "The settlement layer knows everything. The agent knows almost nothing. OneShot moves the truth, and the enforcement, across that gap."
          </p>
        </div>
      </section>

      {/* 5.3 THE LIFECYCLE */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 border-t border-[#1F2733]">
        <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-8">
          THE ON-CHAIN LIFECYCLE
        </div>

        {/* State strip */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2">
            {/* LIVE */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-[4px] bg-[#F5A524]/15 border border-[#F5A524] text-[#F5A524] font-mono text-xs font-semibold tracking-wider">
                LIVE
              </span>
              <span className="text-xs text-[#8A94A6] font-mono">Attempt in flight</span>
            </div>

            <div className="hidden sm:block flex-1 h-[1px] bg-[#1F2733] mx-4" />

            {/* SETTLED */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-[4px] bg-[#2BD576]/15 border border-[#2BD576] text-[#2BD576] font-mono text-xs font-semibold tracking-wider">
                SETTLED
              </span>
              <span className="text-xs text-[#8A94A6] font-mono">Resolved & consumed</span>
            </div>

            <div className="hidden sm:block flex-1 h-[1px] bg-[#1F2733] mx-4" />

            {/* EXPIRED */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-[4px] bg-[#5B6577]/20 border border-[#5B6577] text-[#5B6577] font-mono text-xs font-semibold tracking-wider">
                EXPIRED
              </span>
              <span className="text-xs text-[#8A94A6] font-mono">Deadline passed</span>
            </div>
          </div>

          {/* Grid table */}
          <div className="overflow-x-auto mt-6 border-t border-[#1F2733] pt-6">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1F2733] text-[#8A94A6] uppercase tracking-wider">
                  <th className="py-2 pr-4 font-normal">State</th>
                  <th className="py-2 px-4 font-normal">Meaning</th>
                  <th className="py-2 px-4 font-normal">Budget</th>
                  <th className="py-2 pl-4 font-normal">Retry allowed?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2733]/60">
                <tr>
                  <td className="py-3 pr-4 text-[#F5A524] font-semibold">LIVE</td>
                  <td className="py-3 px-4 text-[#E6EAF0]">An execution attempt is in flight</td>
                  <td className="py-3 px-4 text-[#8A94A6]">Reserved</td>
                  <td className="py-3 pl-4 text-[#7C8CA8]">No, blocked by the contract</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-[#2BD576] font-semibold">SETTLED</td>
                  <td className="py-3 px-4 text-[#E6EAF0]">Execution resolved; effects known</td>
                  <td className="py-3 px-4 text-[#8A94A6]">Consumed</td>
                  <td className="py-3 pl-4 text-[#8A94A6]">Returns original result, never re-executes</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-[#5B6577] font-semibold">EXPIRED</td>
                  <td className="py-3 px-4 text-[#E6EAF0]">Deadline passed and provably dead</td>
                  <td className="py-3 px-4 text-[#8A94A6]">Released</td>
                  <td className="py-3 pl-4 text-[#2BD576]">Fresh attempt is safe</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Absolute Rule Callout */}
        <div className="p-4 rounded-[6px] border border-[#1F2733] bg-[#0F141C] text-sm text-[#8A94A6]">
          <strong className="text-[#E6EAF0]">The absolute rule:</strong> A new execution is only possible if the decision is EXPIRED. A timeout can never create an execution. Only resolved evidence can.
        </div>
      </section>

      {/* 5.4 THE MECHANISM TEASER */}
      <section id="mechanism-teaser" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 border-t border-[#1F2733]">
        <div className="flex items-center justify-between mb-8">
          <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6]">
            THE FOUR PILLARS
          </div>
          <button
            onClick={() => onNavigate('/how-it-works')}
            className="flex items-center gap-1 text-xs font-mono text-[#E6EAF0] hover:text-white transition-colors"
          >
            <span>Full mechanism</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Decision-bound identity */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded bg-[#151B25] border border-[#1F2733] flex items-center justify-center text-[#E6EAF0] mb-4">
                <Hash size={16} />
              </div>
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-1">
                IDENTITY
              </div>
              <h4 className="text-base font-semibold text-[#E6EAF0] mb-2">
                Decision-bound identity
              </h4>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Hash of agent account, asset, size, direction, bounds and expiry, not transaction bytes.
              </p>
            </div>
          </div>

          {/* Card 2: Lifecycle */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded bg-[#151B25] border border-[#1F2733] flex items-center justify-center text-[#E6EAF0] mb-4">
                <Activity size={16} />
              </div>
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-1">
                STATE MACHINE
              </div>
              <h4 className="text-base font-semibold text-[#E6EAF0] mb-2">
                Three-state lifecycle
              </h4>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                LIVE, SETTLED, EXPIRED. A timeout never produces an execution, only resolved evidence does.
              </p>
            </div>
          </div>

          {/* Card 3: Reservation */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded bg-[#151B25] border border-[#1F2733] flex items-center justify-center text-[#E6EAF0] mb-4">
                <Lock size={16} />
              </div>
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-1">
                EXPOSURE CONTROL
              </div>
              <h4 className="text-base font-semibold text-[#E6EAF0] mb-2">
                Reservation engine
              </h4>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Atomically locks the decision budget in-flight against a global ceiling before dispatch.
              </p>
            </div>
          </div>

          {/* Card 4: Resolution by evidence */}
          <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-5 flex flex-col justify-between">
            <div>
              <div className="w-8 h-8 rounded bg-[#151B25] border border-[#1F2733] flex items-center justify-center text-[#E6EAF0] mb-4">
                <ShieldCheck size={16} />
              </div>
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-1">
                SETTLEMENT PROOF
              </div>
              <h4 className="text-base font-semibold text-[#E6EAF0] mb-2">
                Resolution by evidence
              </h4>
              <p className="text-xs text-[#8A94A6] leading-relaxed">
                Direct promise callbacks on Rhea and verifier ledger reads on NEAR Intents. Zero guessing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5.5 PROOF STRIP */}
      <section className="bg-[#0F141C] border-y border-[#1F2733] py-12 px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <div className="text-xs font-mono uppercase tracking-[0.06em] text-[#8A94A6]">
              MEASURED REPLAY EVIDENCE (MAINNET TEST SESSION)
            </div>
            <span className="text-xs font-mono text-[#8A94A6]">
              NEAR Mainnet block #131,894,204
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Tile 1 */}
            <div className="bg-[#0A0E14] border border-[#1F2733] rounded-[6px] p-5">
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-2">
                DUPLICATE FILLS
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#8A94A6] block">UNPROTECTED</span>
                  <span className="text-2xl font-semibold text-[#FF5A36]">5 fills</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#8A94A6] block">ONESHOT</span>
                  <span className="text-2xl font-semibold text-[#2BD576]">0 fills</span>
                </div>
              </div>
            </div>

            {/* Tile 2 */}
            <div className="bg-[#0A0E14] border border-[#1F2733] rounded-[6px] p-5">
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-2">
                CAPITAL DAMAGE ($)
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <div>
                  <span className="text-[10px] text-[#8A94A6] block">UNPROTECTED</span>
                  <span className="text-2xl font-semibold text-[#FF5A36]">$2,500</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#8A94A6] block">ONESHOT</span>
                  <span className="text-2xl font-semibold text-[#2BD576]">$0</span>
                </div>
              </div>
            </div>

            {/* Tile 3 */}
            <div className="bg-[#0A0E14] border border-[#1F2733] rounded-[6px] p-5">
              <div className="text-[11px] font-mono text-[#8A94A6] uppercase tracking-wider mb-2">
                PEAK IN THE AIR
              </div>
              <ReservationBar inAir={500} ceiling={500} state="LIVE" size="md" />
              <div className="flex items-center justify-between text-[10px] font-mono text-[#8A94A6] mt-2">
                <span>CEILING ENFORCED</span>
                <span className="text-[#2BD576] font-semibold">100% BLOCKED ON OVERAGE</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleRunDemo}
              className="px-6 py-2.5 bg-[#E6EAF0] text-[#0A0E14] font-semibold text-xs rounded-[4px] hover:bg-white transition-colors cursor-pointer"
            >
              Run it yourself
            </button>
          </div>
        </div>
      </section>

      {/* 5.6 CLOSING */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#E6EAF0] mb-4">
          One decision. One shot.
        </h2>
        <p className="text-lg text-[#8A94A6] max-w-[600px] mx-auto mb-8">
          The guard contract runs on NEAR Mainnet. Wrap your agent in three lines of code.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={handleRunDemo}
            className="px-6 py-3 bg-[#E6EAF0] text-[#0A0E14] font-semibold text-sm rounded-[4px] hover:bg-white transition-colors cursor-pointer"
          >
            Run chaos demo
          </button>
          <button
            onClick={() => onNavigate('/builders')}
            className="px-6 py-3 bg-transparent text-[#E6EAF0] border border-[#1F2733] hover:border-[#8A94A6] font-semibold text-sm rounded-[4px] transition-colors cursor-pointer"
          >
            Read builder docs
          </button>
        </div>
      </section>
    </div>
  );
};
