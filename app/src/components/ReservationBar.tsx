import React, { useEffect, useState } from 'react';

interface ReservationBarProps {
  inAir: number;
  ceiling: number;
  state: 'IDLE' | 'LIVE' | 'SETTLED' | 'EXPIRED';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ReservationBar: React.FC<ReservationBarProps> = ({
  inAir,
  ceiling,
  state,
  showLabel = true,
  size = 'md',
  className = '',
}) => {
  const [settledFlash, setSettledFlash] = useState(false);

  // Trigger brief flash when transitioning to SETTLED
  useEffect(() => {
    if (state === 'SETTLED') {
      setSettledFlash(true);
      const timer = setTimeout(() => setSettledFlash(false), 650);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const percentage = Math.min(100, Math.max(0, (inAir / (ceiling || 500)) * 100));
  const heightClass = size === 'lg' ? 'h-2' : size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between text-[11px] font-mono tracking-[0.06em] text-[#8A94A6] mb-1.5 uppercase select-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                state === 'LIVE'
                  ? 'bg-[#F5A524] shadow-[0_0_8px_#F5A524]'
                  : state === 'SETTLED'
                  ? 'bg-[#2BD576]'
                  : state === 'EXPIRED'
                  ? 'bg-[#5B6577]'
                  : 'bg-[#1F2733]'
              }`}
            />
            <span>IN THE AIR</span>
          </div>
          <span className="text-[#E6EAF0]">
            <span
              className={
                state === 'LIVE'
                  ? 'text-[#F5A524] font-semibold'
                  : state === 'SETTLED'
                  ? 'text-[#2BD576]'
                  : 'text-[#8A94A6]'
              }
            >
              ${inAir.toFixed(2)}
            </span>{' '}
            / ${ceiling.toFixed(2)} CEILING
          </span>
        </div>
      )}

      {/* Bar container */}
      <div
        className={`relative w-full ${heightClass} bg-[#151B25] rounded-[2px] overflow-hidden border border-[#1F2733]/60`}
      >
        {/* Global ceiling tick (at 100% mark or relative) */}
        <div
          className="absolute top-0 bottom-0 right-0 w-[2px] bg-[#8A94A6]/50 z-20"
          title={`Global ceiling: $${ceiling.toFixed(2)}`}
        />

        {/* Active reservation fill */}
        <div
          className={`h-full transition-all duration-600 ease-out relative ${
            settledFlash
              ? 'bg-[#2BD576] shadow-[0_0_12px_#2BD576]'
              : state === 'LIVE'
              ? 'bg-[#F5A524] shadow-[inset_0_0_6px_rgba(245,165,36,0.6)]'
              : state === 'EXPIRED'
              ? 'bg-[#5B6577]'
              : 'bg-transparent'
          }`}
          style={{ width: `${state === 'SETTLED' ? 0 : percentage}%` }}
        >
          {/* Subtle pulse on leading edge while LIVE */}
          {state === 'LIVE' && percentage > 0 && (
            <div className="absolute top-0 right-0 bottom-0 w-2 bg-white/70 animate-pulse" />
          )}
        </div>

        {/* Flash effect when settled */}
        {settledFlash && (
          <div className="absolute inset-0 bg-[#2BD576]/30 animate-ping pointer-events-none" />
        )}
      </div>
    </div>
  );
};
