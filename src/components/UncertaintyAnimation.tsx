import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';

export const UncertaintyAnimation: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0); // 0 to 14 seconds
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    if (mq.matches) setIsPlaying(false);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      if (e.matches) setIsPlaying(false);
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      return;
    }

    const loop = (now: number) => {
      if (lastTimeRef.current !== null) {
        const delta = (now - lastTimeRef.current) / 1000;
        setElapsed((prev) => (prev + delta) % 14);
      }
      lastTimeRef.current = now;
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  // Derived timeline state:
  // t=0 to 1.5: initial packet travels left to uncertainty window (x: 10% -> 40%)
  // t=1.5 to 3.5: packet enters uncertainty window, stalls, ack: none
  // t=3.5 to 9.5: retries fire
  //   Retry 1 at t=3.5
  //   Retry 2 at t=4.4
  //   Retry 3 at t=5.3
  //   Retry 4 at t=6.2
  //   Retry 5 at t=7.1
  // t=9.5 to 11.5: settlement reaches
  // t=11.5 to 14.0: hold end state, then loop

  // Top lane metrics
  const unprotDupCount =
    elapsed < 4.0 ? 0 : elapsed < 4.9 ? 1 : elapsed < 5.8 ? 2 : elapsed < 6.7 ? 3 : 4;
  const unprotDamage = unprotDupCount * 500;

  // Bottom lane metrics
  const oneshotSettled = elapsed >= 10.0;
  const inAirAmount = elapsed >= 1.5 && elapsed < 10.0 ? 500 : 0;

  const retryTimes = [3.5, 4.4, 5.3, 6.2, 7.1];

  return (
    <div className="w-full bg-[#0F141C] border border-[#1F2733] rounded-[6px] overflow-hidden my-8 select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0A0E14] border-b border-[#1F2733] text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[#8A94A6] uppercase tracking-[0.06em]">
            UNCERTAINTY WINDOW DYNAMICS (14s LOOP)
          </span>
          <span className="text-[#1F2733]">•</span>
          <span className="text-[#E6EAF0]">T+{(elapsed).toFixed(1)}s</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#151B25] border border-[#1F2733] text-[#8A94A6] hover:text-[#E6EAF0] text-[11px] uppercase tracking-wider transition-colors"
            aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={() => {
              setElapsed(0);
              setIsPlaying(true);
            }}
            className="p-1 rounded bg-[#151B25] border border-[#1F2733] text-[#8A94A6] hover:text-[#E6EAF0] transition-colors"
            aria-label="Replay animation"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* SVG Canvas Stage */}
      <div className="relative w-full overflow-x-auto p-4 md:p-6 bg-[#0A0E14]/60 min-w-[700px]">
        {/* Background grid markings & uncertainty zone */}
        <div className="relative h-[280px]">
          {/* Uncertainty Window Column in Middle */}
          <div
            className="absolute top-0 bottom-0 left-[35%] w-[30%] bg-[#151B25]/80 border-x border-dashed border-[#1F2733] flex flex-col justify-between items-center py-2 pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(31, 39, 51, 0.4) 10px, rgba(31, 39, 51, 0.4) 20px)',
            }}
          >
            <span className="text-[11px] font-mono tracking-widest text-[#8A94A6] bg-[#0A0E14]/90 px-2 py-0.5 rounded border border-[#1F2733]">
              UNCERTAINTY WINDOW
            </span>
            <span className="text-[10px] font-mono tracking-widest text-[#8A94A6] bg-[#0A0E14]/90 px-2 py-0.5 rounded border border-[#1F2733]">
              ack: none
            </span>
          </div>

          {/* Left Column: DECISION */}
          <div className="absolute left-3 top-2 pointer-events-none text-[9px] font-mono text-[#8A94A6] uppercase tracking-wider">
            ORIGIN
          </div>

          {/* Right Column: SETTLEMENT */}
          <div className="absolute right-3 top-2 pointer-events-none text-[9px] font-mono text-[#8A94A6] uppercase tracking-wider text-right">
            SETTLEMENT
          </div>

          {/* ================= LANE 1: UNPROTECTED ================= */}
          <div className="absolute top-2 left-0 right-0 h-[125px] border border-[#1F2733] rounded-[6px] bg-[#0F141C]/80 p-3">
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#FF5A36]/10 text-[#FF5A36] border border-[#FF5A36]/30 font-semibold text-[10px]">
                  UNPROTECTED AGENT
                </span>
                <span className="text-[#8A94A6] text-[11px]">
                  DECISION: buy 500 USDC of NEAR
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#8A94A6] text-[11px]">
                  DUPLICATE FILLS:{' '}
                  <strong className="text-[#FF5A36]">{unprotDupCount}</strong>
                </span>
                <span className="text-[#8A94A6] text-[11px]">
                  DAMAGE:{' '}
                  <strong className="text-[#FF5A36]">${unprotDamage}</strong>
                </span>
              </div>
            </div>

            {/* Lane Track */}
            <div className="relative h-10 w-full flex items-center">
              {/* Baseline wire */}
              <div className="absolute left-4 right-4 h-[1px] bg-[#1F2733]" />

              {/* Start node */}
              <div className="absolute left-4 w-3 h-3 rounded-full bg-[#151B25] border border-[#8A94A6]" />

              {/* End node */}
              <div className="absolute right-4 w-3 h-3 rounded-full bg-[#151B25] border border-[#8A94A6]" />

              {/* Initial packet 1 */}
              {elapsed >= 0 && (
                <div
                  className="absolute h-4 px-2 rounded-[3px] bg-[#151B25] border border-[#FF5A36] text-[#FF5A36] text-[9px] font-mono flex items-center justify-center transition-all duration-75 shadow-[0_0_6px_rgba(255,90,54,0.4)]"
                  style={{
                    left: `${
                      elapsed < 1.5
                        ? 4 + (elapsed / 1.5) * 44
                        : elapsed < 10
                        ? 48
                        : 48 + ((elapsed - 10) / 1.5) * 44
                    }%`,
                  }}
                >
                  attempt 1
                </div>
              )}

              {/* Retries firing and landing as red duplicate fills */}
              {retryTimes.map((rt, idx) => {
                if (elapsed < rt) return null;
                const timeSinceSpawn = elapsed - rt;
                // Moves from left (4%) across to settlement (92%)
                const progress = Math.min(1, timeSinceSpawn / 2.2);
                const pos = 4 + progress * 88;
                const isLanded = progress >= 1;

                return (
                  <div
                    key={`retry-${idx}`}
                    className={`absolute h-4 px-1.5 rounded-[3px] text-[9px] font-mono flex items-center justify-center border transition-all duration-75 ${
                      isLanded
                        ? 'bg-[#FF5A36]/20 border-[#FF5A36] text-[#FF5A36]'
                        : 'bg-[#151B25] border-[#FF5A36]/70 text-[#FF5A36]'
                    }`}
                    style={{ left: `${pos}%` }}
                  >
                    {isLanded ? `FILL #${idx + 2} (+$500)` : `retry ${idx + 2}`}
                  </div>
                );
              })}
            </div>

            {/* Bottom caption */}
            <div className="mt-1 text-[11px] font-mono text-[#8A94A6] flex justify-between">
              <span>Each retry treated as isolated authorization.</span>
              <span className="text-[#FF5A36]">
                {elapsed >= 7.5
                  ? 'Five approved. $2,500 spent against a $500 authorization.'
                  : 'Timer expired -> treats unknown as failed -> spawns retry.'}
              </span>
            </div>
          </div>

          {/* ================= LANE 2: ONESHOT ================= */}
          <div className="absolute bottom-2 left-0 right-0 h-[135px] border border-[#1F2733] rounded-[6px] bg-[#0F141C]/80 p-3">
            <div className="flex items-center justify-between text-xs font-mono mb-1.5">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#2BD576]/10 text-[#2BD576] border border-[#2BD576]/30 font-semibold text-[10px]">
                  ONESHOT AGENT
                </span>
                <span className="text-[#8A94A6] text-[11px]">
                  IDENTITY: 0x9f3a…c21e
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#8A94A6] text-[11px]">
                  EXECUTIONS:{' '}
                  <strong className={oneshotSettled ? 'text-[#2BD576]' : 'text-[#8A94A6]'}>
                    {oneshotSettled ? '1' : '0'}
                  </strong>
                </span>
                <span className="text-[#8A94A6] text-[11px]">
                  DAMAGE: <strong className="text-[#2BD576]">$0</strong>
                </span>
              </div>
            </div>

            {/* Reservation bar in flight */}
            <div className="mb-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#8A94A6] uppercase tracking-wider mb-1">
                <span>RESERVATION ENGINE</span>
                <span className={inAirAmount > 0 ? 'text-[#F5A524]' : 'text-[#8A94A6]'}>
                  IN THE AIR: ${inAirAmount}.00 / $500.00 CEILING
                </span>
              </div>
              <div className="w-full h-1.5 bg-[#151B25] rounded-[2px] overflow-hidden border border-[#1F2733]">
                <div
                  className={`h-full transition-all duration-300 ${
                    oneshotSettled
                      ? 'w-0 bg-[#2BD576]'
                      : inAirAmount > 0
                      ? 'w-full bg-[#F5A524] shadow-[0_0_8px_#F5A524]'
                      : 'w-0 bg-transparent'
                  }`}
                />
              </div>
            </div>

            {/* Lane Track */}
            <div className="relative h-8 w-full flex items-center">
              {/* Baseline wire */}
              <div className="absolute left-4 right-4 h-[1px] bg-[#1F2733]" />

              {/* Start node */}
              <div className="absolute left-4 w-3 h-3 rounded-full bg-[#151B25] border border-[#8A94A6]" />

              {/* Guard Gate Icon at 32% (just before uncertainty window) */}
              <div
                className="absolute left-[32%] w-5 h-5 -ml-2.5 rounded bg-[#151B25] border border-[#7C8CA8] flex items-center justify-center text-[#7C8CA8] z-10"
                title="OneShot Guard Contract"
              >
                <ShieldCheck size={12} />
              </div>

              {/* End node */}
              <div className="absolute right-4 w-3 h-3 rounded-full bg-[#151B25] border border-[#8A94A6]" />

              {/* Packet 1 entering zone and settling */}
              {elapsed >= 0 && (
                <div
                  className={`absolute h-4 px-2 rounded-[3px] text-[9px] font-mono flex items-center justify-center transition-all duration-75 ${
                    oneshotSettled
                      ? 'bg-[#2BD576]/20 border border-[#2BD576] text-[#2BD576] shadow-[0_0_8px_#2BD576]'
                      : 'bg-[#151B25] border border-[#F5A524] text-[#F5A524]'
                  }`}
                  style={{
                    left: `${
                      elapsed < 1.5
                        ? 4 + (elapsed / 1.5) * 44
                        : elapsed < 10
                        ? 48
                        : 48 + ((elapsed - 10) / 1.5) * 44
                    }%`,
                  }}
                >
                  {oneshotSettled ? 'SETTLED' : 'attempt 1 (LIVE)'}
                </div>
              )}

              {/* Retries reaching the gate and being blocked */}
              {retryTimes.map((rt, idx) => {
                if (elapsed < rt) return null;
                const timeSinceSpawn = elapsed - rt;
                // Travels from left (4%) to gate (32%), bounces back or flashes blocked
                const reachGate = Math.min(1, timeSinceSpawn / 0.8);
                const pos = 4 + reachGate * 26;
                const isBlocked = reachGate >= 1;

                return (
                  <div
                    key={`os-retry-${idx}`}
                    className={`absolute h-4 px-1.5 rounded-[3px] text-[9px] font-mono flex items-center justify-center border transition-all duration-75 ${
                      isBlocked
                        ? 'bg-[#7C8CA8]/15 border-[#7C8CA8] text-[#7C8CA8]'
                        : 'bg-[#151B25] border-[#8A94A6] text-[#8A94A6]'
                    }`}
                    style={{ left: `${isBlocked ? 24 : pos}%` }}
                  >
                    {isBlocked ? 'LIVE: retry blocked' : `retry ${idx + 2}`}
                  </div>
                );
              })}
            </div>

            {/* Bottom caption */}
            <div className="mt-1 text-[11px] font-mono text-[#8A94A6] flex justify-between">
              <span>Guard evaluates decision identity. Active reservation holds funds.</span>
              <span className="text-[#2BD576]">
                {oneshotSettled
                  ? 'Promise callback verified: 1 execution settled. $0 damage.'
                  : 'Retries rejected: exactly-once enforced on-chain.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer callout banner */}
      <div className="px-4 py-2.5 bg-[#151B25] border-t border-[#1F2733] text-xs font-mono text-[#8A94A6] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2BD576]" />
          <span>
            A card network places a hold on your funds the moment you commit. OneShot is that hold, for AI agents, on-chain.
          </span>
        </div>
        <span className="text-[#E6EAF0] text-[11px] uppercase tracking-wider">
          Enforced at settlement layer
        </span>
      </div>
    </div>
  );
};
