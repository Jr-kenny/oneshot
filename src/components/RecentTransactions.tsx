import React, { useState } from 'react';
import { OnChainTx } from '../types';
import { ExternalLink, Copy, Check, Filter, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface RecentTransactionsProps {
  transactions: OnChainTx[];
  isRunning: boolean;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  isRunning,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ONESHOT' | 'UNPROTECTED' | 'SETTLED'>('ALL');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const handleCopy = (txHash: string) => {
    navigator.clipboard.writeText(txHash);
    setCopiedTx(txHash);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const filteredTxs = transactions.filter((tx) => {
    if (filter === 'ONESHOT') return tx.agent === 'oneshot';
    if (filter === 'UNPROTECTED') return tx.agent === 'unprotected';
    if (filter === 'SETTLED') return tx.status === 'SETTLED';
    return true;
  });

  return (
    <div className="w-full bg-[#0F141C] border border-[#1F2733] rounded-[6px] overflow-hidden my-4 select-none">
      {/* Header */}
      <div className="px-4 py-2.5 bg-[#151B25] border-b border-[#1F2733] flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[#8A94A6] uppercase tracking-[0.06em]">
            ON-CHAIN EXECUTION TRANSACTIONS
          </span>
          <span className="text-[#1F2733]">•</span>
          <span className="text-[#E6EAF0]">{transactions.length} RECORDED</span>
          {isRunning && (
            <span className="flex items-center gap-1 text-[10px] text-[#F5A524] bg-[#F5A524]/10 px-1.5 py-0.5 rounded border border-[#F5A524]/30 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5A524]" />
              STREAMING
            </span>
          )}
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1 bg-[#0A0E14] p-0.5 rounded-[4px] border border-[#1F2733]">
          <span className="text-[10px] text-[#8A94A6] px-1.5 uppercase tracking-wider flex items-center gap-1">
            <Filter size={10} />
            Filter
          </span>
          {(['ALL', 'ONESHOT', 'UNPROTECTED', 'SETTLED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-[3px] text-[10px] transition-colors ${
                filter === f
                  ? 'bg-[#1F2733] text-[#E6EAF0] font-semibold'
                  : 'text-[#8A94A6] hover:text-[#E6EAF0]'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'ONESHOT' ? 'OneShot' : f === 'UNPROTECTED' ? 'Unprotected' : 'Settled'}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table / List */}
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="sticky top-0 bg-[#0A0E14] border-b border-[#1F2733] text-[#8A94A6] uppercase tracking-wider text-[10px] z-10">
            <tr>
              <th className="py-2 px-3 font-normal">Block / Time</th>
              <th className="py-2 px-3 font-normal">Tx Hash</th>
              <th className="py-2 px-3 font-normal">Agent</th>
              <th className="py-2 px-3 font-normal">Method</th>
              <th className="py-2 px-3 font-normal">Venue</th>
              <th className="py-2 px-3 font-normal">Status</th>
              <th className="py-2 px-3 font-normal">Amount</th>
              <th className="py-2 px-3 font-normal">Gas</th>
              <th className="py-2 px-3 font-normal">Execution Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1F2733]/60 bg-[#0F141C]">
            {filteredTxs.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-xs text-[#8A94A6] italic">
                  No transactions match the selected filter.
                </td>
              </tr>
            ) : (
              filteredTxs.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-[#151B25]/60 transition-colors animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  {/* Block / Time */}
                  <td className="py-2 px-3 text-[#8A94A6] whitespace-nowrap">
                    <span className="text-[#E6EAF0]">#{tx.blockNumber}</span>
                    <span className="block text-[10px] text-[#5B6577]">{tx.timestamp}</span>
                  </td>

                  {/* Tx Hash */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#E6EAF0]">
                        {tx.txHash.length > 14
                          ? `${tx.txHash.slice(0, 8)}…${tx.txHash.slice(-4)}`
                          : tx.txHash}
                      </span>
                      <button
                        onClick={() => handleCopy(tx.txHash)}
                        className="p-1 hover:text-[#E6EAF0] text-[#8A94A6] focus:outline-none"
                        aria-label="Copy transaction hash"
                      >
                        {copiedTx === tx.txHash ? (
                          <Check size={11} className="text-[#2BD576]" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                      <a
                        href={`https://nearblocks.io/txns/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#8A94A6] hover:text-[#E6EAF0]"
                        aria-label="View on explorer"
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </td>

                  {/* Agent */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {tx.agent === 'oneshot' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#2BD576]">
                        <ShieldCheck size={11} />
                        OneShot
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#FF5A36]">
                        <ShieldAlert size={11} />
                        Unprotected
                      </span>
                    )}
                  </td>

                  {/* Method */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded bg-[#151B25] border border-[#1F2733] text-[#E6EAF0] text-[10px]">
                      {tx.method}
                    </span>
                  </td>

                  {/* Venue */}
                  <td className="py-2 px-3 text-[#8A94A6] text-[11px] whitespace-nowrap">
                    {tx.venue.replace('.near', '')}
                  </td>

                  {/* Status */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {tx.status === 'SETTLED' ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#2BD576]/15 border border-[#2BD576]/30 text-[#2BD576] font-semibold text-[10px]">
                        SETTLED
                      </span>
                    ) : tx.status === 'LIVE' ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#F5A524]/15 border border-[#F5A524]/30 text-[#F5A524] font-semibold text-[10px]">
                        LIVE
                      </span>
                    ) : tx.status === 'BLOCKED' ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#7C8CA8]/15 border border-[#7C8CA8]/30 text-[#7C8CA8] font-semibold text-[10px]">
                        BLOCKED
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#FF5A36]/15 border border-[#FF5A36]/30 text-[#FF5A36] font-semibold text-[10px]">
                        DUP FILL
                      </span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="py-2 px-3 text-[#E6EAF0] whitespace-nowrap">
                    ${tx.amount.toFixed(2)}
                  </td>

                  {/* Gas */}
                  <td className="py-2 px-3 text-[#8A94A6] text-[11px] whitespace-nowrap">
                    {tx.gasBurntTgas} Tgas
                  </td>

                  {/* Details */}
                  <td className="py-2 px-3 text-[#8A94A6] text-[11px] max-w-[280px] truncate" title={tx.details}>
                    {tx.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info note */}
      <div className="px-4 py-2 bg-[#0A0E14] border-t border-[#1F2733] text-[11px] font-mono text-[#8A94A6] flex items-center justify-between">
        <span>Cross-referenced against NEAR Mainnet ledger proofs.</span>
        <span className="text-[#E6EAF0]">Network: NEAR Mainnet</span>
      </div>
    </div>
  );
};
