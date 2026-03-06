
import React, { useState, useMemo } from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { PortfolioData, TargetAllocation } from '../types';
import { SUPPORTED_SYMBOLS } from '../constants';
import { saveTargetAllocations } from '../services/portfolioService';
import { RefreshCw, Calculator, ArrowRight, AlertCircle, Save, CheckCircle2, PieChart as PieChartIcon, TrendingUp, X } from 'lucide-react';

const COLORS = ['#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE', '#EFF6FF'];

interface RebalancingToolProps {
  portfolio: PortfolioData;
  targets: TargetAllocation[];
  setTargets: React.Dispatch<React.SetStateAction<TargetAllocation[]>>;
  budgetTWD: number;
  setBudgetTWD: React.Dispatch<React.SetStateAction<number>>;
  mergedClusters: Record<string, string[]>;
  setMergedClusters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export const RebalancingTool: React.FC<RebalancingToolProps> = ({ portfolio, targets, setTargets, budgetTWD, setBudgetTWD, mergedClusters, setMergedClusters }) => {
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [rebalanceMode, setRebalanceMode] = useState<'BUY_ONLY' | 'STRICT'>('BUY_ONLY');

  const totalTargetPercent = useMemo(() => targets.reduce((sum, t) => sum + t.percent, 0), [targets]);

  // 核心邏輯：計算如何分配有限預算
  const result = useMemo(() => {
    if (portfolio.holdings.length === 0 || totalTargetPercent === 0 || budgetTWD <= 0) return { suggestions: [], projectedData: [] };

    const budgetUSD = budgetTWD / portfolio.exchangeRate;
    const currentTotalUSD = portfolio.totalMarketValueUSD;
    const nextTotalUSD = currentTotalUSD + budgetUSD;

    // 1. 計算每個標的在「理想狀態」下應該要有的市值
    // 先建立所有已被合併進群組的子標的 Set，這些標的需跳過（value 已計在 parent 裡）
    const clusterChildSet = new Set<string>(
      (Object.values(mergedClusters) as string[][]).flat()
    );

    const assets = targets
      .filter(t => !clusterChildSet.has(t.symbol)) // 跳過已並入群組的子標的
      .map(t => {
        // Find children clustered under this symbol
        const clusterChildren = mergedClusters[t.symbol] || [];
        const allClusterSymbols = [t.symbol, ...clusterChildren];
        
        let currentValueUSD = 0;
        if (clusterChildren.length > 0) {
          currentValueUSD = portfolio.holdings
            .filter(h => allClusterSymbols.includes(h.symbol))
            .reduce((sum, h) => sum + h.currentMarketValueUSD, 0);
        } else {
          const holding = portfolio.holdings.find(h => h.symbol === t.symbol);
          currentValueUSD = holding?.currentMarketValueUSD || 0;
        }

        const targetValueUSD = (nextTotalUSD * t.percent) / 100;
        const gapUSD = targetValueUSD - currentValueUSD; // 此標的距離理想目標還差多少錢

        return {
          symbol: t.symbol,
          currentValueUSD,
          targetValueUSD,
          gapUSD, // 原始缺口，可能為負（代表需要賣出）
          targetPercent: t.percent
        };
      });

    let suggestions: any[] = [];

    if (rebalanceMode === 'BUY_ONLY') {
      // 原本的邏輯：只考慮需要買入的（Underweight），按比例分配預算
      const totalGapUSD = assets.filter(a => a.gapUSD > 0).reduce((sum, a) => sum + a.gapUSD, 0);
      
      suggestions = assets
        .filter(a => a.gapUSD > 0.01)
        .map(a => {
          const gapOnlyObj = a.gapUSD > 0 ? a.gapUSD : 0;
          const allocatedBuyUSD = totalGapUSD > 0 ? (gapOnlyObj / totalGapUSD) * budgetUSD : 0;
          return {
            symbol: a.symbol,
            buyUSD: allocatedBuyUSD, // 正數代表買入
            buyTWD: allocatedBuyUSD * portfolio.exchangeRate,
            currentValueUSD: a.currentValueUSD
          };
        })
        .filter(s => s.buyUSD > 0.1)
        .sort((a, b) => b.buyUSD - a.buyUSD);
    } else {
      // 絕對平衡模式：直接反映 gapUSD，包含買與賣
      suggestions = assets
        .filter(a => Math.abs(a.gapUSD) > 0.01)
        .map(a => {
          return {
            symbol: a.symbol,
            buyUSD: a.gapUSD, // 正數為買，負數為賣
            buyTWD: a.gapUSD * portfolio.exchangeRate,
            currentValueUSD: a.currentValueUSD
          };
        })
        .sort((a, b) => b.buyUSD - a.buyUSD);
    }

    // 3. 計算預期配置 (Pro Forma)
    const projectedDataMap = new Map();
    
    // First, add all existing holdings
    portfolio.holdings.forEach(h => {
      // Find if this holding is a child in any cluster
      let parentKey = h.symbol;
      for (const [parent, children] of Object.entries(mergedClusters) as [string, string[]][]) {
        if (children.includes(h.symbol) || parent === h.symbol) {
          parentKey = parent;
          break;
        }
      }

      const existing = projectedDataMap.get(parentKey) || { name: parentKey, value: 0, currentPercent: 0, _isGroup: mergedClusters[parentKey] && mergedClusters[parentKey].length > 0 };
      projectedDataMap.set(parentKey, {
        ...existing,
        name: existing._isGroup ? `${parentKey} 群組` : h.symbol, 
        value: existing.value + h.currentMarketValueUSD,
        currentPercent: existing.currentPercent + h.currentPercent
      });
    });

    // Then add the buy suggestions
    suggestions.forEach(s => {
      let parentKey = s.symbol;
      for (const [parent, children] of Object.entries(mergedClusters) as [string, string[]][]) {
        if (children.includes(s.symbol) || parent === s.symbol) {
          parentKey = parent;
          break;
        }
      }
      
      const existing = projectedDataMap.get(parentKey) || { name: parentKey, value: 0, currentPercent: 0, _isGroup: mergedClusters[parentKey] && mergedClusters[parentKey].length > 0 };
      projectedDataMap.set(parentKey, {
        ...existing,
        name: existing._isGroup ? `${parentKey} 群組` : s.symbol,
        value: existing.value + s.buyUSD
      });
    });

    const projectedData = Array.from(projectedDataMap.values())
      .filter(d => d.value > 0)
      .map(d => ({
        name: d.name,
        value: d.value,
        currentPercent: d.currentPercent
      }));

    return { suggestions, projectedData };
  }, [targets, budgetTWD, portfolio, totalTargetPercent, rebalanceMode, mergedClusters]);

  const updateTarget = (symbol: string, value: string) => {
    const num = parseFloat(value);
    const finalNum = isNaN(num) ? 0 : num;
    setTargets(prev => {
      const exists = prev.some(t => t.symbol === symbol);
      if (exists) {
        return prev.map(t => t.symbol === symbol ? { ...t, percent: finalNum } : t);
      }
      return [...prev, { symbol, percent: finalNum }];
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, symbol: string) => {
    e.dataTransfer.setData('text/plain', symbol);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetSymbol: string) => {
    e.preventDefault();
    const sourceSymbol = e.dataTransfer.getData('text/plain');
    if (sourceSymbol === targetSymbol) return;

    // Build relationship: child merged into parent
    setMergedClusters(prev => {
      const next = { ...prev };
      // If source is already a parent, we don't handle complex deep mapping here, keep it simple for now
      // Let's ensure the source symbol is removed from any previous clusters it might be in
      Object.keys(next).forEach(parent => {
        next[parent] = next[parent].filter(child => child !== sourceSymbol);
      });
      // Add source symbol to the new parent's cluster
      if (!next[targetSymbol]) next[targetSymbol] = [];
      if (!next[targetSymbol].includes(sourceSymbol)) {
        next[targetSymbol].push(sourceSymbol);
      }
      return next;
    });

    // Zero out the target percent of the source symbol since it is now "merged"
    setTargets(prev => prev.map(t => t.symbol === sourceSymbol ? { ...t, percent: 0 } : t));
  };

  const handleRemoveFromCluster = (parentSymbol: string, childSymbol: string) => {
    setMergedClusters(prev => {
      const next = { ...prev };
      if (next[parentSymbol]) {
        next[parentSymbol] = next[parentSymbol].filter(c => c !== childSymbol);
      }
      return next;
    });
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

  const groupedSymbols = useMemo(() => {
    const activeSymbols = SUPPORTED_SYMBOLS.filter(s => 
      portfolio.holdings.some(h => h.symbol === s.value && h.totalQuantity > 0)
    );
    
    return {
      TW: activeSymbols.filter(s => s.type === 'TW' && s.category !== 'BONDS'),
      US: activeSymbols.filter(s => s.type === 'US' && s.category !== 'BONDS'),
      UK: activeSymbols.filter(s => s.type === 'UK' && s.category !== 'BONDS'),
      CRYPTO: activeSymbols.filter(s => s.type === 'CRYPTO'),
      BONDS: activeSymbols.filter(s => s.category === 'BONDS'),
    };
  }, [portfolio.holdings]);

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
            {Object.entries(groupedSymbols)
              .filter((entry): entry is [string, typeof SUPPORTED_SYMBOLS] => {
                const [_, symbols] = entry;
                return Array.isArray(symbols) && symbols.length > 0;
              })
              .map(([group, symbols]: [string, typeof SUPPORTED_SYMBOLS]) => (
              <div key={group} className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">
                  {group === 'TW' ? '台股' : group === 'US' ? '美股' : group === 'UK' ? '英股' : group === 'CRYPTO' ? '加密貨幣' : '美債'}
                </h4>
                <div className="space-y-2">
                  {symbols.map(s => {
                    // Check if this symbol is a child in any cluster
                    const isChild = Object.values(mergedClusters).some((children: string[]) => children.includes(s.value));
                    if (isChild) return null; // Hide it from the main list, it will be rendered inside its parent

                    const t = targets.find(target => target.symbol === s.value) || { symbol: s.value, percent: 0 };
                    
                    // The combined current percent for this parent and its children
                    const clusterChildren = mergedClusters[s.value] || [];
                    const allClusterSymbols = [s.value, ...clusterChildren];
                    const currentP = portfolio.holdings
                      .filter(h => allClusterSymbols.includes(h.symbol))
                      .reduce((sum, h) => sum + h.currentPercent, 0);

                    return (
                      <div 
                        key={s.value} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, s.value)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, s.value)}
                        className={`flex items-center gap-4 p-4 rounded-3xl transition-colors border ${clusterChildren.length > 0 ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50/50 border-transparent hover:border-slate-100 hover:bg-slate-50'}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-700">{s.label.split(' (')[0]}</p>
                            {clusterChildren.map(childSymbol => (
                              <div key={childSymbol} className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
                                <span className="text-[10px] font-bold text-slate-500">{childSymbol.split('.')[0]}</span>
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFromCluster(s.value, childSymbol); }} className="text-slate-400 hover:text-red-500 flex items-center justify-center">
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, currentP)}%` }}></div>
                             </div>
                             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">目前 {currentP.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="w-24 relative">
                          <input 
                            type="number"
                            value={t.percent === 0 ? '' : t.percent}
                            onChange={(e) => updateTarget(t.symbol, e.target.value)}
                            onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
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
            {Object.values(groupedSymbols).every((symbols: unknown) => Array.isArray(symbols) && symbols.length === 0) && (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm font-bold">目前沒有任何資產紀錄</p>
                <p className="text-[10px] mt-1 uppercase tracking-widest">請先至「購買紀錄」新增您的持倉標的</p>
              </div>
            )}
          </div>

          {Math.abs(totalTargetPercent - 100) > 0.1 && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 p-4 rounded-2xl border border-red-100 animate-pulse">
              <AlertCircle size={16} />
              <span className="font-medium">請確保百分比總和為 100.0% 以獲得精確建議</span>
            </div>
          )}
        </div>

        {portfolio.holdings.length > 0 && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <h3 className="text-xl font-bold text-slate-800">2. 投入資金與模式</h3>
                <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
                  <button
                    onClick={() => setRebalanceMode('BUY_ONLY')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${rebalanceMode === 'BUY_ONLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    存股加碼 (只買不賣)
                  </button>
                  <button
                    onClick={() => setRebalanceMode('STRICT')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${rebalanceMode === 'STRICT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    絕對平衡 (買進與賣出)
                  </button>
                </div>
              </div>

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
                  result.suggestions.map(s => {
                    const isBuy = s.buyUSD > 0;
                    return (
                      <div key={s.symbol} className="bg-white/5 p-5 rounded-3xl border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors group">
                        <div>
                          <h4 className={`font-black text-lg tracking-tight transition-colors ${isBuy ? 'group-hover:text-blue-400' : 'group-hover:text-red-400'}`}>{s.symbol}</h4>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            {isBuy ? '建議買入' : '建議賣出'}: ${Math.abs(s.buyUSD).toFixed(0)} USD
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black font-mono ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                            NT$ {Math.round(Math.abs(s.buyTWD)).toLocaleString()}
                          </div>
                          <div className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">
                            {rebalanceMode === 'BUY_ONLY' ? `佔本次投入 ${((s.buyTWD / budgetTWD) * 100).toFixed(1)}%` : '調整金額'}
                          </div>
                        </div>
                      </div>
                    );
                  })
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
                      {[...result.projectedData].sort((a, b) => b.value - a.value).slice(0, 3).map((d, i) => {
                        const newValPercent = (d.value / (portfolio.totalMarketValueUSD + (budgetTWD / portfolio.exchangeRate))) * 100;
                        return (
                          <div key={d.name} className="flex justify-between items-center text-[10px] font-bold">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                              <span className="text-slate-400">{d.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 line-through decoration-slate-600/50">{d.currentPercent.toFixed(1)}%</span>
                              <ArrowRight size={10} className="text-slate-600" />
                              <span className="text-blue-400">{newValPercent.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
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
        )}
      </div>
    </div>
  );
};
