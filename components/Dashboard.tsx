
import React, { useMemo, useState } from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { SymbolHolding, PortfolioData, PurchaseRecord } from '../types';
import { calculateXIRR } from '../services/portfolioService';
import { CATEGORY_LABELS, AssetCategory } from '../constants';
// Alias PieChart to PieChartIcon to avoid conflict with Recharts component and match its usage
import { Wallet, TrendingUp, DollarSign, Activity, ChevronRight, PieChart as PieChartIcon, Globe, RefreshCw, Loader2, Layers } from 'lucide-react';

const COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE'];
const CAT_COLORS: Record<string, string> = {
  GLOBAL: '#2563EB',
  TW: '#10B981',
  CRYPTO: '#F59E0B',
  BONDS: '#6366F1',
  OTHER: '#94A3B8'
};

interface DashboardProps {
  portfolio: PortfolioData;
  records: PurchaseRecord[];
  displayCurrency: 'USD' | 'TWD';
  onToggleCurrency: () => void;
  onNavigate: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const StatCard: React.FC<{ title: string; value: string; subValue?: string; icon: React.ReactNode; color: string; trend?: number; onClick?: () => void; clickable?: boolean }> = ({ title, value, subValue, icon, color, trend, onClick, clickable }) => (
  <div className={`bg-white p-4 lg:p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow ${clickable ? 'cursor-pointer select-none' : ''}`} onClick={onClick}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${color}`}>
        {icon}
      </div>
      {trend !== undefined && !isNaN(trend) && (
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {trend >= 0 ? '+' : ''}{trend.toFixed(2)}%
        </span>
      )}
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">{title}{clickable ? <span className="ml-1 opacity-30">⇄</span> : null}</p>
      <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{value}</h3>
      {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ portfolio, records, displayCurrency, onToggleCurrency, onNavigate, onRefresh, isRefreshing }) => {
  // 0: Total Gain, 1: XIRR, 2: CAGR
  const [returnDisplayMode, setReturnDisplayMode] = useState<0 | 1 | 2>(0);
  
  // Compute first purchase date per symbol to calculate years held
  const firstPurchaseDateBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach(r => {
      const ts = new Date(r.date).getTime();
      if (!map[r.symbol] || ts < map[r.symbol]) {
        map[r.symbol] = ts;
      }
    });
    return map;
  }, [records]);

  const chartData = (portfolio?.holdings || []).map(h => ({ name: h.symbol, value: h.currentMarketValueUSD || 0 }));
  
  const categoryData = useMemo(() => {
    const groups: Record<string, number> = {};
    (portfolio?.holdings || []).forEach(h => {
      groups[h.category] = (groups[h.category] || 0) + h.currentMarketValueUSD;
    });
    return Object.entries(groups).map(([cat, val]) => ({
      name: CATEGORY_LABELS[cat as AssetCategory] || '其他',
      value: val,
      color: CAT_COLORS[cat] || '#94A3B8'
    }));
  }, [portfolio]);

  const totalGain = (portfolio?.totalMarketValueUSD || 0) - (portfolio?.totalCostUSD || 0);
  const totalGainPercent = (portfolio?.totalCostUSD || 0) > 0 ? (totalGain / portfolio.totalCostUSD) * 100 : 0;

  const rate = portfolio?.exchangeRate || 32.4;
  const isTWD = displayCurrency === 'TWD';

  const getAnnualizedReturn = (h: SymbolHolding): number | null => {
    const symbolRecords = records.filter(sq => sq.symbol === h.symbol);
    if (symbolRecords.length === 0) return null;

    const cashFlows: { amount: number, date: Date }[] = [];
    let hasNonZeroHoldingTime = false;
    const now = Date.now();

    symbolRecords.forEach(r => {
      let amountTWD = 0;
      if (r.currency === 'TWD') {
        amountTWD = r.price * r.quantity;
      } else {
        amountTWD = r.twdCost ? r.twdCost : (r.price * r.quantity * rate);
      }
      
      const recordDate = new Date(r.date);
      if ((now - recordDate.getTime()) > 1000 * 60 * 60 * 24 * 18) {
        hasNonZeroHoldingTime = true;
      }

      cashFlows.push({
        amount: r.type === 'BUY' ? -amountTWD : amountTWD,
        date: recordDate
      });
    });

    if (!hasNonZeroHoldingTime) return null;

    // Use currentMarketValueUSD directly
    const currentTWDValue = h.currentMarketValueUSD * rate;
    
    cashFlows.push({
      amount: currentTWDValue,
      date: new Date()
    });

    const xirr = calculateXIRR(cashFlows);
    return xirr !== null ? xirr * 100 : null;
  };

  const getHoldingCAGR = (h: SymbolHolding): number | null => {
    const firstTs = firstPurchaseDateBySymbol[h.symbol];
    if (!firstTs) return null;
    const yearsHeld = (Date.now() - firstTs) / (1000 * 60 * 60 * 24 * 365.25);
    if (yearsHeld < 0.05) return null; // Less than ~18 days: too short
    const totalReturn = h.gainPercent / 100;
    return (Math.pow(1 + totalReturn, 1 / yearsHeld) - 1) * 100;
  };

  // Portfolio-wide XIRR (Annualized Return based on actual cash flows)
  const portfolioAnnualizedReturn = useMemo(() => {
    if (records.length === 0 || portfolio?.totalMarketValueUSD <= 0) return null;
    
    const cashFlows: { amount: number, date: Date }[] = [];
    let hasNonZeroHoldingTime = false;
    const now = Date.now();

    records.forEach(r => {
      let amountTWD = 0;
      if (r.currency === 'TWD') {
        amountTWD = r.price * r.quantity;
      } else {
        // Fallback to current rate if explicit twdCost is missing
        amountTWD = r.twdCost ? r.twdCost : (r.price * r.quantity * rate);
      }
      
      const recordDate = new Date(r.date);
      if ((now - recordDate.getTime()) > 1000 * 60 * 60 * 24 * 18) {
        hasNonZeroHoldingTime = true; // Need at least ~18 days of holding for meaningful annualized return
      }

      // Outflow is negative, inflow is positive
      cashFlows.push({
        amount: r.type === 'BUY' ? -amountTWD : amountTWD,
        date: recordDate
      });
    });

    if (!hasNonZeroHoldingTime) return null;

    // View the current portfolio value as the final positive cash flow (as if sold today)
    cashFlows.push({
      amount: portfolio.totalCostUSD > 0 ? portfolio.totalMarketValueUSD * rate : 0, // In TWD conceptually
      date: new Date()
    });

    const xirr = calculateXIRR(cashFlows);
    return xirr !== null ? xirr * 100 : null; // Convert to percentage
  }, [records, portfolio?.totalMarketValueUSD, portfolio?.totalCostUSD, rate]);

  // Portfolio-wide CAGR
  const portfolioCAGR = useMemo(() => {
    if (records.length === 0 || portfolio?.totalCostUSD <= 0) return null;
    const earliest = Math.min(...records.map(r => new Date(r.date).getTime()));
    const yearsHeld = (Date.now() - earliest) / (1000 * 60 * 60 * 24 * 365.25);
    if (yearsHeld < 0.05) return null;
    const totalReturn = totalGainPercent / 100;
    return (Math.pow(1 + totalReturn, 1 / yearsHeld) - 1) * 100;
  }, [records, totalGainPercent, portfolio?.totalCostUSD]);

  const lastUpdateDate = portfolio?.timestamp ? new Date(portfolio.timestamp) : new Date();
  const formattedTime = lastUpdateDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatNum = (val: number | undefined, options?: Intl.NumberFormatOptions) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val.toLocaleString(undefined, options);
  };

  // Format a USD value in the currently selected display currency
  const fmtMoney = (usdVal: number, digits = 0): string => {
    const v = isTWD ? usdVal * rate : usdVal;
    const prefix = isTWD ? 'NT$ ' : '$ ';
    return prefix + v.toLocaleString(undefined, { maximumFractionDigits: digits });
  };

  // Format a single unit price (h.currentPrice is strictly in USD everywhere)
  const fmtPrice = (h: SymbolHolding): string => {
    if (isTWD) return `NT$ ${formatNum(h.currentPrice * rate, { maximumFractionDigits: 2 })}`;
    return `$ ${formatNum(h.currentPrice, { maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">資產總覽</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <p className="text-slate-400 font-medium text-xs">上次更新：{formattedTime}</p>
            </div>
            <button 
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-all disabled:opacity-50 shadow-sm"
            >
              {isRefreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isRefreshing ? '同步中...' : '更新現價'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Currency Toggle */}
          <button
            onClick={onToggleCurrency}
            className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Globe size={14} className="text-blue-600" />
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">USD/TWD: {portfolio?.exchangeRate?.toFixed(2) || "32.40"}</span>
            <div className="flex bg-slate-100 rounded-lg overflow-hidden text-[10px] font-black ml-1">
              <span className={`px-1.5 py-0.5 transition-colors ${!isTWD ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>$</span>
              <span className={`px-1.5 py-0.5 transition-colors ${isTWD ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>NT$</span>
            </div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title={`總資產市值 (${displayCurrency})`}
          value={fmtMoney(portfolio?.totalMarketValueUSD || 0)}
          subValue={isTWD
            ? `≈ $ ${formatNum(portfolio?.totalMarketValueUSD, { maximumFractionDigits: 0 })} USD`
            : `≈ NT$ ${formatNum((portfolio?.totalMarketValueUSD || 0) * rate, { maximumFractionDigits: 0 })}`
          }
          icon={<Wallet className="text-blue-600" size={24} />}
          color="bg-blue-50"
        />
        <StatCard 
          title={returnDisplayMode === 1 ? '年化報酬 (XIRR)' : returnDisplayMode === 2 ? '年化報酬 (CAGR)' : `累計總損益 (${displayCurrency})`} 
          value={returnDisplayMode === 1
            ? (portfolioAnnualizedReturn !== null ? `${portfolioAnnualizedReturn >= 0 ? '+' : ''}${portfolioAnnualizedReturn.toFixed(2)}%` : '—')
            : returnDisplayMode === 2
            ? (portfolioCAGR !== null ? `${portfolioCAGR >= 0 ? '+' : ''}${portfolioCAGR.toFixed(2)}%` : '—')
            : fmtMoney(totalGain)
          }
          trend={returnDisplayMode === 0 ? totalGainPercent : undefined}
          subValue={returnDisplayMode === 0 ? `累計報酬 ${totalGainPercent.toFixed(2)}%` : undefined}
          icon={<TrendingUp className="text-green-600" size={24} />}
          color="bg-green-50"
          clickable
          onClick={() => setReturnDisplayMode(v => ((v + 1) % 3) as 0 | 1 | 2)}
        />
        <StatCard 
          title="歷史投入本金" 
          value={fmtMoney(portfolio?.totalCostUSD || 0)}
          icon={<DollarSign className="text-amber-600" size={24} />}
          color="bg-amber-50"
        />
        <StatCard 
          title="目前持倉標的" 
          value={(portfolio?.holdings?.length || 0).toString()}
          icon={<Layers className="text-purple-600" size={24} />}
          color="bg-purple-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 flex flex-col gap-8">
          <div className="bg-white p-5 lg:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">類別分佈</h3>
              <PieChartIcon size={20} className="text-slate-300" />
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={categoryData.length > 0 ? categoryData : [{ name: 'Empty', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {categoryData.map((cat) => (
                <div key={cat.name} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }}></div>
                    <span className="text-sm font-medium text-slate-600">{cat.name}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-800">
                    {((cat.value / (portfolio?.totalMarketValueUSD || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 lg:p-8 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">主要持倉實時表現</h3>
            <button onClick={() => onNavigate('records')} className="text-blue-600 text-xs font-bold uppercase tracking-widest hover:underline">查看全部</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">標的</th>
                  <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">數量</th>
                  <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">實時單價</th>
                  <th
                    className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold cursor-pointer select-none hover:text-blue-500 transition-colors group whitespace-nowrap"
                    onClick={() => setReturnDisplayMode(v => ((v + 1) % 3) as 0 | 1 | 2)}
                    title="點擊切換"
                  >
                    {returnDisplayMode === 1 ? '年化報酬 (XIRR)' : returnDisplayMode === 2 ? '年化報酬 (CAGR)' : '損益狀況'}
                    <span className="ml-1 text-slate-300 group-hover:text-blue-400">⇄</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(portfolio?.holdings || []).map((h) => (
                  <tr key={h.symbol} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{h.symbol}</div>
                      <div className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold inline-block uppercase tracking-wider">
                        {CATEGORY_LABELS[h.category as AssetCategory] || h.category}
                      </div>
                    </td>
                    <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                      <div className="font-mono text-sm font-bold text-slate-800">{formatNum(h.totalQuantity)}</div>
                      <div className="text-xs text-slate-400">{fmtMoney(h.currentMarketValueUSD)}</div>
                    </td>
                    <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                      <div className="font-mono text-sm font-bold text-slate-800">{fmtPrice(h)}</div>
                    </td>
                    <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                      {returnDisplayMode !== 0 ? (() => {
                        const annReturn = returnDisplayMode === 1 ? getAnnualizedReturn(h) : getHoldingCAGR(h);
                        const label = returnDisplayMode === 1 ? 'XIRR' : 'CAGR';
                        return (
                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-bold font-mono ${h.gainPercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {h.gainPercent >= 0 ? '+' : ''}{h.gainPercent.toFixed(2)}%
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${annReturn && annReturn >= 0 ? 'text-green-600/70' : 'text-red-500/70'}`}>
                              {annReturn !== null ? `${annReturn >= 0 ? '+' : ''}${annReturn.toFixed(1)}% ${label}` : '累積過短'}
                            </span>
                          </div>
                        );
                      })() : (
                        <>
                          <div className={`font-mono text-sm font-bold ${h.gainUSD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {h.gainUSD >= 0 ? '+' : '-'}{fmtMoney(Math.abs(h.gainUSD))}
                          </div>
                          <div className={`text-[10px] font-bold ${h.gainPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ({(h.gainPercent || 0).toFixed(2)}%)
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
