
import React, { useState, useMemo } from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { PortfolioData, TargetAllocation } from '../types';
import { SUPPORTED_SYMBOLS } from '../constants';
import { getTargetAllocations, saveTargetAllocations } from '../services/portfolioService';
import { RefreshCw, Calculator, ArrowRight, AlertCircle, Save, CheckCircle2, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';

const COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE', '#EFF6FF'];

interface RebalancingToolProps {
  portfolio: PortfolioData;
}

export const RebalancingTool: React.FC<RebalancingToolProps> = ({ portfolio }) => {
  const [targets, setTargets] = useState<TargetAllocation[]>(() => {
    const saved = getTargetAllocations();
    if (saved && saved.length > 0) return saved;
    return SUPPORTED_SYMBOLS.map(s => ({ symbol: s.value, percent: 0 }));
  });

  const [budgetTWD, setBudgetTWD] = useState<number>(50000);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const totalTargetPercent = useMemo(() => targets.reduce((sum, t) => sum + t.percent, 0), [targets]);

  // 核心邏輯：計算如何分配有限預算
  const result = useMemo(() => {
    if (totalTargetPercent === 0 || budgetTWD <= 0) return { suggestions: [], projectedData: [] };

    const budgetUSD = budgetTWD / portfolio.exchangeRate;
    const currentTotalUSD = portfolio.totalMarketValueUSD;
    const nextTotalUSD = currentTotalUSD + budgetUSD;

    // 1. 計算每個標的在「理想狀態」下應該要有的市值
    const assets = targets.map(t => {
      const holding = portfolio.holdings.find(h => h.symbol === t.symbol);
      const currentValueUSD = holding?.currentMarketValueUSD || 0;
      const targetValueUSD = (nextTotalUSD * t.percent) / 100;
      const gapUSD = targetValueUSD - currentValueUSD; // 此標的距離理想目標還差多少錢

      return {
        symbol: t.symbol,
        currentValueUSD,
        targetValueUSD,
        gapUSD: Math.max(0, gapUSD), // 只考慮需要買入的（Underweight）
        targetPercent: t.percent
      };
    });

    const totalGapUSD = assets.reduce((sum, a) => sum + a.gapUSD, 0);

    // 2. 分配預算
    // 如果總缺口大於預算，則依缺口比例分配預算
    // 如果預算大於總缺口（通常不會發生在定期定額），則全部滿足缺口
    const suggestions = assets
      .filter(a => a.gapUSD > 0.01)
      .map(a => {
        const allocatedBuyUSD = totalGapUSD > 0 ? (a.gapUSD / totalGapUSD) * budgetUSD : 0;
        return {
          symbol: a.symbol,
          buyUSD: allocatedBuyUSD,
          buyTWD: allocatedBuyUSD * portfolio.exchangeRate,
          currentValueUSD: a.currentValueUSD
        };
      })
      .filter(s => s.buyUSD > 0.1)
      .sort((a, b) => b.buyUSD - a.buyUSD);

    // 3. 計算預期配置 (Pro Forma)
    const projectedData = targets.map(t => {
      const currentHolding = portfolio.holdings.find(h => h.symbol === t.symbol);
      const currentVal = currentHolding?.currentMarketValueUSD || 0;
      const buyVal = suggestions.find(s => s.symbol === t.symbol)?.buyUSD || 0;
      return {
        name: t.symbol,
        value: currentVal + buyVal
      };
    }).filter(d => d.value > 0);

    return { suggestions, projectedData };
  }, [targets, budgetTWD, portfolio, totalTargetPercent]);

  const updateTarget = (symbol: string, value: string) => {
    const num = parseFloat(value) || 0;
    setTargets(prev => prev.map(t => t.symbol === symbol ? { ...t, percent: num } : t));
  };

  const handleSaveTargets = () => {
    saveTargetAllocations(targets);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const autoBalance = () => {
    const activeSymbols = portfolio.holdings.length;
    if (activeSymbols === 0) return;
    const equalShare = 100 / activeSymbols;
    setTargets(prev => prev.map(t => {
      const isActive = portfolio.holdings.some(h => h.symbol === t.symbol);
      return { ...t, percent: isActive ? parseFloat(equalShare.toFixed(1)) : 0 };
    }));
  };

  const groupedSymbols = useMemo(() => ({
    TW: SUPPORTED_SYMBOLS.filter(s => s.type === 'TW'),
    US: SUPPORTED_SYMBOLS.filter(s => s.type === 'US'),
    CRYPTO: SUPPORTED_SYMBOLS.filter(s => s.type === 'CRYPTO')
  }), []);

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">再平衡建議工具</h1>
          <p className="text-slate-500 font-medium">基於您的「{budgetTWD.toLocaleString()} 元」預算進行最優化分配</p>
        </div>
        <div className="flex gap-2">
           <button onClick={autoBalance} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
            <RefreshCw size={14} /> 一鍵平分現有持倉
          </button>
          <button onClick={handleSaveTargets} className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${showSavedToast ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {showSavedToast ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {showSavedToast ? '配置已儲存' : '儲存配置範本'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-slate-800">1. 設定您的目標 (%)</h3>
            <div className={`text-sm font-black font-mono px-3 py-1 rounded-full ${Math.abs(totalTargetPercent - 100) < 0.1 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
              總計: {totalTargetPercent.toFixed(1)}%
            </div>
          </div>

          <div className="space-y-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(groupedSymbols).map(([group, symbols]) => (
              <div key={group} className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">
                  {group === 'TW' ? '台股' : group === 'US' ? '美股' : '加密貨幣'}
                </h4>
                <div className="space-y-2">
                  {symbols.map(s => {
                    const t = targets.find(target => target.symbol === s.value)!;
                    const currentP = portfolio.holdings.find(h => h.symbol === s.value)?.currentPercent || 0;
                    return (
                      <div key={s.value} className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-3xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-700">{s.label.split(' (')[0]}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${currentP}%` }}></div>
                             </div>
                             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">目前 {currentP.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="w-24 relative">
                          <input 
                            type="number"
                            value={t.percent || ''}
                            onChange={(e) => updateTarget(t.symbol, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-right font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="0"
                          />
                          <span className="absolute right-2 top-2.5 text-[10px] text-slate-300 font-bold">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {Math.abs(totalTargetPercent - 100) > 0.1 && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100 animate-pulse">
              <AlertCircle size={16} />
              <span className="font-medium">請確保百分比總和為 100.0% 以獲得精確建議</span>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6">2. 投入資金</h3>
            <div className="space-y-4">
              <label className="text-[10px] uppercase tracking-widest font-black text-slate-400">本次預計投入總額 (TWD)</label>
              <div className="relative">
                <span className="absolute left-6 top-6 font-bold text-slate-300 text-xl">NT$</span>
                <input 
                  type="number"
                  value={budgetTWD || ''}
                  onChange={(e) => setBudgetTWD(parseFloat(e.target.value) || 0)}
                  className="w-full pl-16 pr-6 py-6 bg-slate-50 border-none rounded-3xl text-3xl font-black font-mono focus:ring-2 focus:ring-blue-500 outline-none text-blue-600"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-[80px]"></div>
            
            <div className="flex justify-between items-center mb-8 relative z-10">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Calculator size={20} className="text-blue-400" /> 最佳買入路徑
              </h3>
              <div className="text-[10px] font-black bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full uppercase tracking-widest border border-blue-500/30">
                分配預算：100%
              </div>
            </div>
            
            <div className="space-y-4 relative z-10">
              {result.suggestions.length === 0 ? (
                <div className="py-12 text-center opacity-30 border-2 border-dashed border-slate-700 rounded-3xl">
                  <p className="text-sm font-medium">請輸入預算與目標配置比例</p>
                </div>
              ) : (
                result.suggestions.map(s => (
                  <div key={s.symbol} className="bg-white/5 p-5 rounded-3xl border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors group">
                    <div>
                      <h4 className="font-black text-lg tracking-tight group-hover:text-blue-400 transition-colors">{s.symbol}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        建議買入: ${(s.buyUSD).toFixed(0)} USD
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black font-mono text-green-400">NT$ {Math.round(s.buyTWD).toLocaleString()}</div>
                      <div className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">
                        佔本次投入 {((s.buyTWD / budgetTWD) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {result.suggestions.length > 0 && (
              <div className="mt-10 p-6 bg-blue-600/10 rounded-3xl border border-blue-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <PieChartIcon size={18} className="text-blue-400" />
                  <h4 className="text-sm font-bold uppercase tracking-widest">購買後的預期配置 (模擬)</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={result.projectedData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={50}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {result.projectedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#0F172A', border: 'none', borderRadius: '1rem', color: '#FFF' }}
                          itemStyle={{ color: '#FFF' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {result.projectedData.slice(0, 3).map((d, i) => (
                      <div key={d.name} className="flex justify-between items-center text-[10px] font-bold">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                          <span className="text-slate-400">{d.name}</span>
                        </div>
                        <span className="text-blue-400">{( (d.value / (portfolio.totalMarketValueUSD + (budgetTWD / portfolio.exchangeRate))) * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                    <p className="text-[9px] text-slate-600 italic pt-2 border-t border-slate-800">
                      * 顯示投入後前三大標的預估比例
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-slate-800 flex justify-between items-end relative z-10">
              <div className="flex items-center gap-2 text-blue-400">
                <TrendingUp size={16} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">持續平衡計畫</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-1">本次分配總額</p>
                <p className="text-lg font-black font-mono">NT$ {budgetTWD.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
