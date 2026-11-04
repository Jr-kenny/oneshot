import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { CONTRACT_ADDRESS } from '../lib/simulationEngine';

export const Footer: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <footer className="w-full bg-[#0A0E14] border-t border-[#1F2733] py-8 px-4 sm:px-6">
      <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#8A94A6]">
        {/* Left: Hackathon notice & network */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-[#E6EAF0]">Built for the NEAR hackathon</span>
          <span className="text-[#1F2733]">•</span>
          <span className="px-2 py-0.5 rounded-[4px] bg-[#151B25] border border-[#1F2733] text-[#8A94A6] uppercase tracking-wider text-[11px]">
            NEAR Mainnet
          </span>
        </div>

        {/* Center: Contract Address with copy */}
        <div className="flex items-center gap-2 bg-[#0F141C] border border-[#1F2733] px-2.5 py-1.5 rounded-[4px]">
          <span className="text-[11px] uppercase tracking-wider text-[#8A94A6]">Contract:</span>
          <span className="text-[#E6EAF0]">{CONTRACT_ADDRESS}</span>
          <button
            onClick={handleCopy}
            className="p-1 hover:text-[#E6EAF0] transition-colors focus:outline-none"
            aria-label="Copy contract address"
          >
            {copied ? <Check size={13} className="text-[#2BD576]" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Right: GitHub & Explorer */}
        <div className="flex items-center gap-4">
          <a
            href="https://nearblocks.io/address/oneshot-guard.near"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#E6EAF0] transition-colors"
          >
            <span>Explorer</span>
            <ExternalLink size={12} />
          </a>
          <span className="text-[#1F2733]">•</span>
          <a
            href="https://github.com/oneshot-guard/oneshot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-[#E6EAF0] transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </footer>
  );
};
