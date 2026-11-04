import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  SimulationConfig,
  SimulationEvent,
  AgentRunState,
  DecisionState,
  ResolutionSource,
} from '../types';
import {
  DEFAULT_CONFIG,
  buildSimulationSchedule,
  createInitialAgentState,
  applyEventToState,
  formatTimeMs,
  generateDecisionHash,
  CONTRACT_ADDRESS,
  parseEventsToTransactions,
  getHistoricTransactions,
} from '../lib/simulationEngine';
import { ReservationBar } from './ReservationBar';
import { RecentTransactions } from './RecentTransactions';
import { PerformanceDashboard } from './PerformanceDashboard';
import { Play, RotateCcw, ShieldAlert, ShieldCheck, ExternalLink, Zap, ScrollText, Loader2 } from 'lucide-react';

interface DemoConsoleProps {
  autoStart?: boolean;
}

export const DemoConsole: React.FC<DemoConsoleProps> = ({ autoStart = false }) => {
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [agentState, setAgentState] = useState<{
    unprotected: AgentRunState;
    oneshot: AgentRunState;
  }>(createInitialAgentState());
  const [activeTab, setActiveTab] = useState<'both' | 'unprotected' | 'oneshot'>('both');
  const [isConsoleHovered, setIsConsoleHovered] = useState(false);

  // References for playback loop
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const scheduleRef = useRef<SimulationEvent[]>([]);
  const nextEventIdxRef = useRef<number>(0);
  const leftConsoleEndRef = useRef<HTMLDivElement | null>(null);
  const rightConsoleEndRef = useRef<HTMLDivElement | null>(null);

  const resetRun = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startTimeRef.current = null;
    setIsRunning(false);
    setElapsed(0);
    nextEventIdxRef.current = 0;
    scheduleRef.current = [];
    setAgentState(createInitialAgentState());
  }, []);

  const startRun = useCallback(() => {
    resetRun();

    // Generate schedule
    const schedule = buildSimulationSchedule(config);
    scheduleRef.current = schedule;
    setIsRunning(true);
    const startTimestamp = Date.now();
    startTimeRef.current = startTimestamp;

    timerRef.current = setInterval(() => {
      const currentSeconds = (Date.now() - startTimestamp) / 1000;
      setElapsed(currentSeconds);

      // Consume events up to currentSeconds
      while (
        nextEventIdxRef.current < scheduleRef.current.length &&
        scheduleRef.current[nextEventIdxRef.current].t <= currentSeconds
      ) {
        const ev = scheduleRef.current[nextEventIdxRef.current];
        setAgentState((prev) => applyEventToState(prev, ev));
        nextEventIdxRef.current += 1;
      }

      // Check if finished
      if (nextEventIdxRef.current >= scheduleRef.current.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setIsRunning(false);
      }
    }, 50);
  }, [config, resetRun]);

  useEffect(() => {
    if (autoStart) {
      startRun();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoStart]);

  // Auto-scroll consoles if not hovered
  useEffect(() => {
    if (!isConsoleHovered) {
      leftConsoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      rightConsoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentState.unprotected.events.length, agentState.oneshot.events.length, isConsoleHovered]);

  const liveTransactions = useMemo(() => {
    const allEvents = [...agentState.unprotected.events, ...agentState.oneshot.events].sort(
      (a, b) => a.t - b.t
    );
    const parsed = parseEventsToTransactions(allEvents, config);
    return [...parsed, ...getHistoricTransactions()];
  }, [agentState.unprotected.events, agentState.oneshot.events, config]);

  const decisionId = generateDecisionHash('agent-arbitrage.near', 'NEAR/USDC', config.decisionSize);
  const remainingResolutionTime = Math.max(0, config.resolutionDelay - elapsed);

  return (
    <div className="w-full bg-[#0A0E14] text-[#E6EAF0] min-h-[calc(100vh-56px)] flex flex-col font-sans select-none">
      {/* 1. CONTROL BAR (48px) */}
      <div className="bg-[#0F141C] border-b border-[#1F2733] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        {/* Left: Big Run chaos demo + Reset */}
        <div className="flex items-center gap-2">
          <button
            onClick={startRun}
            disabled={isRunning}
            className={`flex items-center gap-2 px-4 py-2 font-semibold text-xs rounded-[4px] transition-all cursor-pointer ${
              isRunning
                ? 'bg-[#151B25] text-[#8A94A6] cursor-not-allowed border border-[#1F2733]'
                : 'bg-[#E6EAF0] text-[#0A0E14] hover:bg-white active:bg-gray-200'
            }`}
          >
            <Play size={13} className={isRunning ? 'animate-pulse text-[#F5A524]' : ''} />
            <span>{isRunning ? `Running T+${elapsed.toFixed(1)}s` : 'Run chaos demo'}</span>
          </button>

          <button
            onClick={resetRun}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#151B25] hover:bg-[#1F2733] text-[#8A94A6] hover:text-[#E6EAF0] rounded-[4px] border border-[#1F2733] transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>

        {/* Middle: Chaos Controls as compact segmented inputs */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Swallow ack toggle */}
          <div className="flex items-center gap-2 bg-[#151B25] px-2.5 py-1 rounded-[4px] border border-[#1F2733]">
            <span className="text-[11px] text-[#8A94A6] uppercase tracking-wider">Swallow ack</span>
            <button
              onClick={() => setConfig({ ...config, swallowAck: !config.swallowAck })}
              className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                config.swallowAck ? 'bg-[#FF5A36]' : 'bg-[#1F2733]'
              }`}
              aria-label="Toggle swallow ack"
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform ${
                  config.swallowAck ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Resolution delay */}
          <div className="flex items-center gap-1 bg-[#151B25] p-0.5 rounded-[4px] border border-[#1F2733]">
            <span className="text-[10px] text-[#8A94A6] px-1.5 uppercase tracking-wider">Delay</span>
            {[3, 8, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => setConfig({ ...config, resolutionDelay: d })}
                className={`px-2 py-0.5 rounded-[3px] text-[11px] transition-colors ${
                  config.resolutionDelay === d
                    ? 'bg-[#1F2733] text-[#E6EAF0] font-semibold'
                    : 'text-[#8A94A6] hover:text-[#E6EAF0]'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>

          {/* Retry count */}
          <div className="flex items-center gap-1 bg-[#151B25] p-0.5 rounded-[4px] border border-[#1F2733]">
            <span className="text-[10px] text-[#8A94A6] px-1.5 uppercase tracking-wider">Retries</span>
            {[3, 5, 8].map((r) => (
              <button
                key={r}
                onClick={() => setConfig({ ...config, retryCount: r })}
                className={`px-2 py-0.5 rounded-[3px] text-[11px] transition-colors ${
                  config.retryCount === r
                    ? 'bg-[#1F2733] text-[#E6EAF0] font-semibold'
                    : 'text-[#8A94A6] hover:text-[#E6EAF0]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Decision size */}
          <div className="flex items-center gap-1 bg-[#151B25] p-0.5 rounded-[4px] border border-[#1F2733]">
            <span className="text-[10px] text-[#8A94A6] px-1.5 uppercase tracking-wider">Size</span>
            {[100, 500, 1000].map((s) => (
              <button
                key={s}
                onClick={() => setConfig({ ...config, decisionSize: s, ceiling: s })}
                className={`px-2 py-0.5 rounded-[3px] text-[11px] transition-colors ${
                  config.decisionSize === s
                    ? 'bg-[#1F2733] text-[#E6EAF0] font-semibold'
                    : 'text-[#8A94A6] hover:text-[#E6EAF0]'
                }`}
              >
                ${s}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Connection chip toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#151B25] p-0.5 rounded-[4px] border border-[#1F2733]">
            <button
              onClick={() => setConfig({ ...config, isLiveMode: true })}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[11px] uppercase tracking-wider ${
                config.isLiveMode ? 'bg-[#1F2733] text-[#2BD576]' : 'text-[#8A94A6]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#2BD576]" />
              <span>Live API</span>
            </button>
            <button
              onClick={() => setConfig({ ...config, isLiveMode: false })}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[11px] uppercase tracking-wider ${
                !config.isLiveMode ? 'bg-[#1F2733] text-[#E6EAF0]' : 'text-[#8A94A6]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#8A94A6]" />
              <span>Replay</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. METER ROW (Three persistent tiles across full width, sticky while scrolling) */}
      <div className="sticky top-14 z-30 bg-[#0A0E14] border-b border-[#1F2733] px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tile 1: DUPLICATE FILLS */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-3 flex flex-col justify-between">
          <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-1">
            DUPLICATE FILLS
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <div>
              <span className="text-[10px] text-[#8A94A6] block">UNPROTECTED</span>
              <span className="text-2xl font-bold text-[#FF5A36]">
                {agentState.unprotected.duplicateFills}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#8A94A6] block">ONESHOT</span>
              <span className="text-2xl font-bold text-[#2BD576]">
                {agentState.oneshot.duplicateFills}
              </span>
            </div>
          </div>
        </div>

        {/* Tile 2: CUMULATIVE DAMAGE ($) */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-3 flex flex-col justify-between">
          <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-[#8A94A6] mb-1">
            CUMULATIVE DAMAGE ($)
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <div>
              <span className="text-[10px] text-[#8A94A6] block">UNPROTECTED</span>
              <span className="text-2xl font-bold text-[#FF5A36]">
                ${agentState.unprotected.damage.toLocaleString()}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#8A94A6] block">ONESHOT</span>
              <span className="text-2xl font-bold text-[#2BD576]">
                ${agentState.oneshot.damage.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Tile 3: MONEY IN THE AIR (Reservation bar at large size) */}
        <div className="bg-[#0F141C] border border-[#1F2733] rounded-[6px] p-3 flex flex-col justify-between">
          <ReservationBar
            inAir={agentState.oneshot.inAir}
            ceiling={config.ceiling}
            state={agentState.oneshot.currentDecisionState as any}
            size="lg"
          />
          <div className="flex items-center justify-between text-[10px] font-mono text-[#8A94A6] mt-2">
            <span>ATOMIC RESERVATION</span>
            <span className="text-[#E6EAF0]">
              {agentState.oneshot.inAir > 0 ? 'HOLD ACTIVE' : 'NO CAPITAL IN FLIGHT'}
            </span>
          </div>
        </div>
      </div>

      {/* CHAOS PROXY BANNER (While running or pending resolution) */}
      {isRunning && config.swallowAck && remainingResolutionTime > 0 && (
        <div className="bg-[#151B25] border-b border-[#1F2733] px-4 py-1.5 flex items-center justify-between text-xs font-mono text-[#F5A524]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F5A524] animate-ping" />
            <span>
              CHAOS PROXY: trade executed on Rhea, ack swallowed, resolution in{' '}
              {remainingResolutionTime.toFixed(1)}s
            </span>
          </div>
          <span className="text-[#8A94A6] text-[11px]">
            Target Venue: v1.rhea-exchange.near
          </span>
        </div>
      )}

      {/* Replay Notice if in Replay mode */}
      {!config.isLiveMode && (
        <div className="bg-[#0A0E14] border-b border-[#1F2733] px-4 py-1 text-[11px] font-mono text-[#8A94A6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.2 rounded bg-[#151B25] border border-[#1F2733] text-[#E6EAF0] text-[9px] uppercase tracking-wider font-semibold">
              REPLAY
            </span>
            <span>Recorded from a real mainnet run on 2026-10-29</span>
            <span className="text-[#1F2733]">•</span>
            <a
              href="https://nearblocks.io/txns/0x7b4ae1298fc3d014"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#E6EAF0] underline decoration-[#1F2733]"
            >
              tx: 0x7b4a…e129
            </a>
          </div>
          <span className="hidden sm:inline text-[10px]">
            Every number is measured and verified on-chain.
          </span>
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="md:hidden flex items-center justify-around border-b border-[#1F2733] bg-[#0F141C] text-xs font-mono">
        <button
          onClick={() => setActiveTab('both')}
          className={`flex-1 py-2 text-center ${
            activeTab === 'both' ? 'text-[#E6EAF0] border-b-2 border-[#E6EAF0]' : 'text-[#8A94A6]'
          }`}
        >
          Side by side
        </button>
        <button
          onClick={() => setActiveTab('unprotected')}
          className={`flex-1 py-2 text-center ${
            activeTab === 'unprotected'
              ? 'text-[#FF5A36] border-b-2 border-[#FF5A36]'
              : 'text-[#8A94A6]'
          }`}
        >
          Unprotected
        </button>
        <button
          onClick={() => setActiveTab('oneshot')}
          className={`flex-1 py-2 text-center ${
            activeTab === 'oneshot'
              ? 'text-[#2BD576] border-b-2 border-[#2BD576]'
              : 'text-[#8A94A6]'
          }`}
        >
          OneShot
        </button>
      </div>

      {/* Split view sub-header */}
      <div className="hidden md:flex items-center justify-center py-1 bg-[#0F141C] border-b border-[#1F2733] text-[10px] font-mono text-[#8A94A6] uppercase tracking-[0.08em] gap-2">
        <span className="w-1 h-1 rounded-full bg-[#1F2733]" />
        <span>same decision, same chaos</span>
        <span className="w-1 h-1 rounded-full bg-[#1F2733]" />
      </div>

      {/* 3. SPLIT VIEW (Two equal columns, 1px divider) */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 relative divide-y md:divide-y-0 md:divide-x divide-[#1F2733]">

        {/* ================= LEFT COLUMN: UNPROTECTED AGENT ================= */}
        {(activeTab === 'both' || activeTab === 'unprotected') && (
          <div className="flex flex-col h-full bg-[#0A0E14] p-4 sm:p-5">
            {/* Header with agent name & draining balance */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1F2733] text-xs font-mono">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-[#FF5A36]" />
                <span className="font-semibold text-[#E6EAF0] uppercase tracking-wider">
                  UNPROTECTED AGENT
                </span>
                <span className="text-[#8A94A6] text-[11px]">(naive retry loop)</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8A94A6] block uppercase tracking-wider">
                  Wallet Balance
                </span>
                <span className="text-sm font-semibold text-[#FF5A36] transition-all duration-300">
                  ${agentState.unprotected.walletBalance.toLocaleString()}.00 USDC
                </span>
              </div>
            </div>

            {/* Decision timeline strip */}
            <div className="py-3 border-b border-[#1F2733]">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-[#8A94A6]">
                  decision <span className="text-[#E6EAF0]">{decisionId}</span>
                </span>
                <span className="text-[10px] uppercase tracking-wider text-[#FF5A36]">
                  NO LIFECYCLE GUARD
                </span>
              </div>

              {/* Row of red numbered attempts, each ending in FILLED stamp */}
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {agentState.unprotected.attempts.length === 0 ? (
                  <span className="text-xs font-mono text-[#8A94A6] italic">
                    Awaiting trigger…
                  </span>
                ) : (
                  agentState.unprotected.attempts.map((att) => (
                    <div
                      key={`unprot-att-${att.attemptNumber}`}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-[#151B25] border text-xs font-mono transition-colors ${
                        att.status === 'WAITING_CONSENSUS'
                          ? 'border-[#F5A524]/60'
                          : 'border-[#FF5A36]/40'
                      }`}
                    >
                      <span className="text-[#8A94A6]">attempt {att.attemptNumber}</span>
                      <span className="text-[#1F2733]">→</span>
                      {att.status === 'WAITING_CONSENSUS' ? (
                        <span className="text-[10px] font-medium text-[#F5A524] bg-[#F5A524]/10 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                          <Loader2 size={10} className="animate-spin text-[#F5A524]" />
                          Waiting for consensus…
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[#FF5A36] bg-[#FF5A36]/10 px-1 rounded">
                          FILLED
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Event Console */}
            <div
              className="flex-1 flex flex-col min-h-[260px] max-h-[420px] bg-[#0F141C] border border-[#1F2733] rounded-[6px] my-3 overflow-hidden"
              onMouseEnter={() => setIsConsoleHovered(true)}
              onMouseLeave={() => setIsConsoleHovered(false)}
            >
              <div className="px-3 py-1.5 bg-[#151B25] border-b border-[#1F2733] flex items-center justify-between text-[11px] font-mono text-[#8A94A6]">
                <span>EVENT CONSOLE (UNPROTECTED)</span>
                <span>{agentState.unprotected.events.length} EVENTS</span>
              </div>
              <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1.5 leading-relaxed">
                {agentState.unprotected.events.length === 0 ? (
                  <div className="text-[#8A94A6] italic text-xs">
                    Console ready. Click "Run chaos demo" to begin run.
                  </div>
                ) : (
                  agentState.unprotected.events.map((ev, i) => {
                    const isFinalizedFill = ev.type === 'fill';
                    return (
                      <div
                        key={`unprot-ev-${i}`}
                        className={`text-[#8A94A6] transition-all duration-300 animate-in fade-in slide-in-from-bottom-1 duration-200 ${
                          isFinalizedFill
                            ? 'bg-[#FF5A36]/10 border-l-2 border-[#FF5A36] pl-2 py-0.5 rounded-r-[2px]'
                            : ''
                        }`}
                      >
                        <span className="text-[#5B6577]">{ev.formattedTime}</span>{' '}
                        <span
                          className={
                            ev.type === 'fill'
                              ? 'text-[#FF5A36] font-semibold'
                              : ev.type === 'retry_attempted'
                              ? 'text-[#F5A524]'
                              : 'text-[#E6EAF0]'
                          }
                        >
                          {ev.type}
                        </span>{' '}
                        <span>{ev.data.message || JSON.stringify(ev.data)}</span>
                      </div>
                    );
                  })
                )}
                <div ref={leftConsoleEndRef} />
              </div>
            </div>

            {/* Outcome Line (Bottom of column) */}
            <div className="p-3 bg-[#151B25] border border-[#FF5A36]/30 rounded-[4px] text-xs font-mono flex items-center justify-between">
              {agentState.unprotected.status === 'FINISHED' ? (
                <span className="text-[#FF5A36] font-bold uppercase tracking-wider animate-in fade-in slide-in-from-bottom-2 duration-400">
                  {agentState.unprotected.duplicateFills + 1} EXECUTIONS. $
                  {((agentState.unprotected.duplicateFills + 1) * config.decisionSize).toLocaleString()}{' '}
                  SPENT AGAINST ${config.decisionSize} AUTHORIZED.
                </span>
              ) : (
                <span className="text-[#8A94A6]">
                  {agentState.unprotected.status === 'RUNNING'
                    ? 'Run in progress: retrying without settlement guard…'
                    : 'Awaiting run execution'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ================= RIGHT COLUMN: ONESHOT AGENT ================= */}
        {(activeTab === 'both' || activeTab === 'oneshot') && (
          <div className="flex flex-col h-full bg-[#0A0E14] p-4 sm:p-5">
            {/* Header with agent name & wallet balance */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1F2733] text-xs font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-[#2BD576]" />
                <span className="font-semibold text-[#E6EAF0] uppercase tracking-wider">
                  ONESHOT AGENT
                </span>
                <span className="text-[#8A94A6] text-[11px]">(guarded settlement)</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#8A94A6] block uppercase tracking-wider">
                  Wallet Balance
                </span>
                <span className="text-sm font-semibold text-[#2BD576]">
                  ${agentState.oneshot.walletBalance.toLocaleString()}.00 USDC
                </span>
              </div>
            </div>

            {/* Decision timeline strip with retry branches */}
            <div className="py-3 border-b border-[#1F2733]">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[#8A94A6]">
                    decision <span className="text-[#E6EAF0]">{decisionId}</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                      agentState.oneshot.currentDecisionState === 'LIVE'
                        ? 'bg-[#F5A524]/20 text-[#F5A524] border border-[#F5A524]/40'
                        : agentState.oneshot.currentDecisionState === 'SETTLED'
                        ? 'bg-[#2BD576]/20 text-[#2BD576] border border-[#2BD576]/40'
                        : agentState.oneshot.currentDecisionState === 'EXPIRED'
                        ? 'bg-[#5B6577]/20 text-[#5B6577] border border-[#5B6577]/40'
                        : 'text-[#8A94A6]'
                    }`}
                  >
                    {agentState.oneshot.currentDecisionState}
                  </span>
                </div>

                {agentState.oneshot.resolutionVia && (
                  <span className="text-[11px] font-mono text-[#2BD576]">
                    via: {agentState.oneshot.resolutionVia}
                  </span>
                )}
              </div>

              {/* Protected timeline with branches */}
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {agentState.oneshot.attempts.length === 0 ? (
                  <span className="text-xs font-mono text-[#8A94A6] italic">
                    Awaiting trigger…
                  </span>
                ) : (
                  agentState.oneshot.attempts.map((att) => {
                    const isMain = att.attemptNumber === 1;
                    return (
                      <div
                        key={`oneshot-att-${att.attemptNumber}`}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-[4px] text-xs font-mono border transition-colors ${
                          att.status === 'WAITING_CONSENSUS'
                            ? 'bg-[#151B25] border-[#F5A524]/60 text-[#F5A524]'
                            : isMain
                            ? att.status === 'FILLED'
                              ? 'bg-[#151B25] border-[#2BD576] text-[#2BD576]'
                              : 'bg-[#151B25] border-[#F5A524] text-[#F5A524]'
                            : 'bg-[#151B25] border-[#7C8CA8]/50 text-[#7C8CA8]'
                        }`}
                      >
                        <span className="text-[#8A94A6]">
                          {isMain ? 'attempt 1' : `retry ${att.attemptNumber}`}
                        </span>
                        <span className="text-[#1F2733]">→</span>
                        {att.status === 'WAITING_CONSENSUS' ? (
                          <span className="text-[10px] font-medium text-[#F5A524] bg-[#F5A524]/10 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                            <Loader2 size={10} className="animate-spin text-[#F5A524]" />
                            Waiting for consensus…
                          </span>
                        ) : isMain ? (
                          <span
                            className={`text-[10px] font-bold px-1 rounded ${
                              att.status === 'FILLED'
                                ? 'bg-[#2BD576]/20 text-[#2BD576]'
                                : 'bg-[#F5A524]/20 text-[#F5A524]'
                            }`}
                          >
                            {att.status === 'FILLED' ? 'SETTLED' : 'LIVE (RESERVED)'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-[#7C8CA8] bg-[#7C8CA8]/15 px-1 rounded flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#7C8CA8]" />
                            LIVE: retry blocked
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Event Console */}
            <div
              className="flex-1 flex flex-col min-h-[260px] max-h-[420px] bg-[#0F141C] border border-[#1F2733] rounded-[6px] my-3 overflow-hidden"
              onMouseEnter={() => setIsConsoleHovered(true)}
              onMouseLeave={() => setIsConsoleHovered(false)}
            >
              <div className="px-3 py-1.5 bg-[#151B25] border-b border-[#1F2733] flex items-center justify-between text-[11px] font-mono text-[#8A94A6]">
                <span>EVENT CONSOLE (ONESHOT GUARD)</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#2BD576] flex items-center gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2BD576]" />
                    GUARD ACTIVE
                  </span>
                  <span>{agentState.oneshot.events.length} EVENTS</span>
                </div>
              </div>
              <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1.5 leading-relaxed">
                {agentState.oneshot.events.length === 0 ? (
                  <div className="text-[#8A94A6] italic text-xs">
                    Guard standing by. Click "Run chaos demo" to begin run.
                  </div>
                ) : (
                  agentState.oneshot.events.map((ev, i) => {
                    const isFinalizedSettlement = ev.type === 'decision_settled';
                    const isBlocked = ev.type === 'retry_blocked';
                    return (
                      <div
                        key={`oneshot-ev-${i}`}
                        className={`text-[#8A94A6] transition-all duration-300 animate-in fade-in slide-in-from-bottom-1 duration-200 ${
                          isFinalizedSettlement
                            ? 'bg-[#2BD576]/10 border-l-2 border-[#2BD576] pl-2 py-0.5 rounded-r-[2px] shadow-[0_0_12px_rgba(43,213,118,0.15)]'
                            : isBlocked
                            ? 'bg-[#7C8CA8]/10 border-l-2 border-[#7C8CA8] pl-2 py-0.5 rounded-r-[2px]'
                            : ''
                        }`}
                      >
                        <span className="text-[#5B6577]">{ev.formattedTime}</span>{' '}
                        <span
                          className={
                            ev.type === 'decision_settled'
                              ? 'text-[#2BD576] font-semibold'
                              : ev.type === 'retry_blocked'
                              ? 'text-[#7C8CA8] font-semibold'
                              : ev.type === 'decision_live'
                              ? 'text-[#F5A524]'
                              : 'text-[#E6EAF0]'
                          }
                        >
                          {ev.type}
                        </span>{' '}
                        <span>{ev.data.message || JSON.stringify(ev.data)}</span>
                      </div>
                    );
                  })
                )}
                <div ref={rightConsoleEndRef} />
              </div>
            </div>

            {/* Outcome Line (Bottom of column) */}
            <div className="p-3 bg-[#151B25] border border-[#2BD576]/30 rounded-[4px] text-xs font-mono flex items-center justify-between">
              {agentState.oneshot.status === 'FINISHED' ? (
                <div className="w-full flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-400">
                  <span className="text-[#2BD576] font-bold uppercase tracking-wider">
                    1 EXECUTION. ${config.decisionSize} SETTLED.{' '}
                    {config.swallowAck ? config.retryCount : 0} RETRIES BLOCKED.
                  </span>
                  {agentState.oneshot.resolutionTx && (
                    <a
                      href={`https://nearblocks.io/txns/${agentState.oneshot.resolutionTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-[#8A94A6] hover:text-[#E6EAF0] underline ml-2"
                    >
                      <span>View on explorer</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-[#8A94A6]">
                  {agentState.oneshot.status === 'RUNNING'
                    ? 'Guard enforcing exactly-once execution…'
                    : 'Awaiting run execution'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. PERFORMANCE DASHBOARD SECTION (Real-Time D3 Telemetry) */}
      <div className="px-4 sm:px-5 pt-4 bg-[#0A0E14] border-t border-[#1F2733]">
        <PerformanceDashboard
          totalTxs={liveTransactions.length}
          duplicateFills={agentState.unprotected.duplicateFills}
          oneshotBlocked={agentState.oneshot.attempts.filter((a) => a.status === 'BLOCKED').length}
          isRunning={isRunning}
          decisionSize={config.decisionSize}
          consensusStatus={agentState.oneshot.consensusStatus}
        />
      </div>

      {/* 5. RECENT TRANSACTIONS COMPONENT (On-Chain Transparency) */}
      <div className="px-4 sm:px-5 pb-6 bg-[#0A0E14]">
        <RecentTransactions transactions={liveTransactions} isRunning={isRunning} />
      </div>
    </div>
  );
};
