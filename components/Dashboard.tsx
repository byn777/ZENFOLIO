
import React, { useMemo } from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { SymbolHolding, PortfolioData } from '../types';
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
  onNavigate: (id: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const StatCard: React.FC<{ title: string; value: string; subValue?: string; icon: React.ReactNode; color: string; trend?: number }> = ({ title, value, subValue, icon, color, trend }) => (
  <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
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
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">{title}</p>
      <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{value}</h3>
      {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ portfolio, onNavigate, onRefresh, isRefreshing }) => {
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

  const lastUpdateDate = portfolio?.timestamp ? new Date(portfolio.timestamp) : new Date();
  const formattedTime = lastUpdateDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatNum = (val: number | undefined, options?: Intl.NumberFormatOptions) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val.toLocaleString(undefined, options);
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
        <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100">
          <Globe size={16} className="text-blue-600" />
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">USD/TWD: {portfolio?.exchangeRate?.toFixed(2) || "32.40"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="總資產市值 (USD)" 
          value={`$${formatNum(portfolio?.totalMarketValueUSD, { maximumFractionDigits: 0 })}`}
          subValue={`≈ NT$ ${formatNum((portfolio?.totalMarketValueUSD || 0) * (portfolio?.exchangeRate || 32.4), { maximumFractionDigits: 0 })}`}
          icon={<Wallet className="text-blue-600" size={24} />}
          color="bg-blue-50"
        />
        <StatCard 
          title="累計總損益" 
          value={`$${formatNum(totalGain, { maximumFractionDigits: 0 })}`}
          trend={totalGainPercent}
          icon={<TrendingUp className="text-green-600" size={24} />}
          color="bg-green-50"
        />
        <StatCard 
          title="歷史投入本金" 
          value={`$${formatNum(portfolio?.totalCostUSD, { maximumFractionDigits: 0 })}`}
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
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
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
          <div className="p-8 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">主要持倉實時表現</h3>
            <button onClick={() => onNavigate('records')} className="text-blue-600 text-xs font-bold uppercase tracking-widest hover:underline">查看全部</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">標的</th>
                  <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">數量</th>
                  <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">實時單價</th>
                  <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">損益狀況</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(portfolio?.holdings || []).map((h) => (
                  <tr key={h.symbol} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-5">
                      <div className="font-bold text-slate-800">{h.symbol}</div>
                      <div className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold inline-block uppercase tracking-wider">
                        {CATEGORY_LABELS[h.category as AssetCategory] || h.category}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="font-mono text-sm font-bold text-slate-800">{formatNum(h.totalQuantity)}</div>
                      <div className="text-xs text-slate-400">${formatNum(h.currentMarketValueUSD, { maximumFractionDigits: 0 })}</div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="font-mono text-sm font-bold text-slate-800">
                        {h.symbol.includes('.TW') ? 'NT$ ' : '$ '}
                        {formatNum((h.symbol.includes('.TW') ? h.currentPrice * (portfolio?.exchangeRate || 32.4) : h.currentPrice), { maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className={`font-mono text-sm font-bold ${h.gainUSD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {h.gainUSD >= 0 ? '+' : ''}{formatNum(h.gainUSD, { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-[10px] font-bold ${h.gainPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ({(h.gainPercent || 0).toFixed(2)}%)
                      </div>
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
