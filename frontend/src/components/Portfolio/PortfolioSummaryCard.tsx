import React from 'react';

interface PortfolioSummaryProps {
  summary: {
    accountNumber: string;
    liquidationValue: number;
    equity: number;
    cash: number;
  };
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryProps> = ({ summary }) => {
  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-1">
        <span>💼</span> Account Summary
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-neutral-400">
        <div>
          <p className="opacity-70">Account #</p>
          <p className="font-semibold text-white">{summary.accountNumber}</p>
        </div>
        <div>
          <p className="opacity-70">Liquidation Value</p>
          <p className="font-semibold text-white">${summary.liquidationValue.toLocaleString()}</p>
        </div>
        <div>
          <p className="opacity-70">Equity</p>
          <p className="font-semibold text-white">${summary.equity.toLocaleString()}</p>
        </div>
        <div>
          <p className="opacity-70">Cash</p>
          <p className="font-semibold text-white">${summary.cash.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default PortfolioSummaryCard;
