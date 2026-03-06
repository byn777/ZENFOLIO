
import React, { useMemo, useState } from 'react';
import { PurchaseRecord } from '../types';
import { SUPPORTED_SYMBOLS } from '../constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calculator, ChevronDown, ChevronUp } from 'lucide-react';

interface AnnualCostAnalysisProps {
  records: PurchaseRecord[];
  currentExchangeRate: number;
}

interface MonthData {
  month: string; // "YYYY-MM"
  twdSpent: number;
  usdBought: number;
  effectiveRate: number; // TWD paid per USD this month
}

interface YearData {
  year: string;
  months: MonthData[];
  totalTWD: number;
  totalUSD: number;
  avgEffectiveRate: number; // weighted avg rate
  rateGainLossUSD: number;  // (avgEffectiveRate - currentRate) / currentRate * totalUSD  [negative = you paid more per USD than today]
  rateGainLossTWD: number;
}

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export const AnnualCostAnalysis: React.FC<AnnualCostAnalysisProps> = ({ records, currentExchangeRate }) => {
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  // Determine which symbols are non-TWD (i.e., USD-denominated: US, UK stocks, Crypto, Bonds)
  const nonTWDSymbols = useMemo(() => {
    const set = new Set<string>();
    SUPPORTED_SYMBOLS.filter(s => s.type !== 'TW').forEach(s => set.add(s.value));
    return set;
  }, []);

  const yearData = useMemo((): YearData[] => {
    const map: Record<string, Record<string, { twdSpent: number; usdBought: number; twdForeignSpent: number }>> = {};

    records.forEach(r => {
      const d = new Date(r.date);
      const year = d.getFullYear().toString();
      const month = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!map[year]) map[year] = {};
      if (!map[year][month]) map[year][month] = { twdSpent: 0, usdBought: 0, twdForeignSpent: 0 };

      const isBuy = r.type === 'BUY' ? 1 : -1;
      
      if (r.currency === 'TWD' && !nonTWDSymbols.has(r.symbol)) {
        // Local assets: exactly price * quantity in TWD
        map[year][month].twdSpent += r.price * r.quantity * isBuy;
      } else {
        // Foreign assets: exactly price * quantity in USD
        const usdAmt = r.price * r.quantity * isBuy;
        // Use exact TWD cost if user logged it, else guess with current rate
        const twdAmt = (r.twdCost && r.twdCost > 0) ? (r.twdCost * isBuy) : (usdAmt * currentExchangeRate);
        
        map[year][month].usdBought += usdAmt;
        map[year][month].twdSpent += twdAmt;
        map[year][month].twdForeignSpent += twdAmt;
      }
    });

    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, monthMap]) => {
        const months: MonthData[] = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({
            month,
            twdSpent: data.twdSpent,
            twdForeignSpent: data.twdForeignSpent, // Propagate the explicit foreign cost!
            usdBought: data.usdBought,
            effectiveRate: data.usdBought > 0 ? data.twdForeignSpent / data.usdBought : currentExchangeRate
          }));

        const totalTWD = months.reduce((s, m) => s + m.twdSpent, 0);
        const totalForeignTWD = months.reduce((s, m) => s + (m as any).twdForeignSpent, 0);
        const totalUSD = months.reduce((s, m) => s + m.usdBought, 0);
        const avgEffectiveRate = totalUSD > 0 ? totalForeignTWD / totalUSD : currentExchangeRate;
        
        // Rate Gain/Loss is just: (What the USD is worth in TWD now) - (What we actually paid in TWD for it)
        const rateGainLossTWD = (totalUSD * currentExchangeRate) - totalForeignTWD;
        const rateGainLossUSD = currentExchangeRate > 0 ? rateGainLossTWD / currentExchangeRate : 0;

        return { year, months, totalTWD, totalForeignTWD, totalUSD, avgEffectiveRate, rateGainLossUSD, rateGainLossTWD };
      });
  }, [records, currentExchangeRate, nonTWDSymbols]);

  const totalAll = useMemo(() => ({
    twdSpent: yearData.reduce((s, y) => s + y.totalTWD, 0),
    usdBought: yearData.reduce((s, y) => s + y.totalUSD, 0),
    ratePL: yearData.reduce((s, y) => s + y.rateGainLossTWD, 0),
  }), [yearData]);

  const chartData = yearData.map(y => ({
    year: y.year,
    '總投入 (萬台幣)': parseFloat((y.totalTWD / 10000).toFixed(1)),
    '兌換美金': parseFloat(y.totalUSD.toFixed(0)),
  }));

  const fmt = (n: number, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">年度匯兌成本分析</h1>
        <p className="text-slate-500 font-medium mt-1">追蹤每年買入外幣資產的台幣支出、換匯成本與匯率損益</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 lg:p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-blue-50"><DollarSign size={24} className="text-blue-600" /></div>
          </div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">歷年總投入台幣 (含換算)</p>
          <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">NT$ {fmt(totalAll.twdSpent)}</h3>
          <p className="text-xs text-slate-500 mt-1">≈ 資產總覽的「歷史投入本金」× 匯率</p>
        </div>
        <div className="bg-white p-5 lg:p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-amber-50"><Calculator size={24} className="text-amber-600" /></div>
          </div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">當前匯率</p>
          <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">1 USD = {currentExchangeRate.toFixed(2)} TWD</h3>
          <p className="text-xs text-slate-500 mt-1">台幣金額均以此匯率換算 (無歷史匯率紀錄)</p>
        </div>
        <div className="bg-white p-5 lg:p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-2xl bg-purple-50"><TrendingUp size={24} className="text-purple-600" /></div>
          </div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">歷年買入外幣資產 (USD)</p>
          <h3 className="text-2xl font-black text-slate-800 font-mono tracking-tighter">${fmt(totalAll.usdBought, 1)}</h3>
          <p className="text-xs text-slate-500 mt-1">≈ NT$ {fmt(totalAll.usdBought * currentExchangeRate)}</p>
        </div>
      </div>

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="bg-white p-5 lg:p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-bold text-slate-800 mb-6">每年投入台幣總額 (萬)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fontWeight: 700, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip formatter={(val: any, name: any) => [name === '兌換美金' ? `$${fmt(val, 0)} USD` : `${val} 萬台幣`, name]} />
              <Legend />
              <Bar dataKey="總投入 (萬台幣)" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Year-by-Year Table */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 lg:p-8 border-b border-slate-50">
          <h3 className="text-xl font-bold text-slate-800">年度明細</h3>
          <p className="text-xs text-slate-400 mt-1">點擊展開查看各月份明細</p>
        </div>

        {yearData.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-bold">尚無外幣購買紀錄</p>
            <p className="text-xs mt-1 uppercase tracking-widest">請先新增美股、英股或加密貨幣的購買紀錄</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 overflow-x-auto">
            {/* Header row */}
            <div className="grid grid-cols-5 px-4 lg:px-8 py-3 bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 min-w-[500px]">
              <div>年份</div>
              <div className="text-right">投入台幣</div>
              <div className="text-right">兌換美金</div>
              <div className="text-right">平均換匯成本</div>
              <div className="text-right">匯率損益 (估算)</div>
            </div>

            {yearData.map(y => (
              <div key={y.year}>
                {/* Year summary row */}
                <div
                  className="grid grid-cols-5 px-4 lg:px-8 py-4 lg:py-5 hover:bg-slate-50/30 transition-colors cursor-pointer items-center min-w-[500px]"
                  onClick={() => setExpandedYear(prev => prev === y.year ? null : y.year)}
                >
                  <div className="flex items-center gap-2 font-black text-slate-800">
                    {expandedYear === y.year ? <ChevronUp size={16} className="text-blue-500" /> : <ChevronDown size={16} className="text-slate-300" />}
                    {y.year} <span className="hidden md:inline">年</span>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-800">NT$ {fmt(y.totalTWD)}</div>
                  <div className="text-right font-mono font-bold text-slate-800">${fmt(y.totalUSD, 1)}</div>
                  <div className="text-right font-mono text-sm text-slate-600">{y.avgEffectiveRate.toFixed(2)}</div>
                  <div className={`text-right font-mono font-bold ${y.rateGainLossTWD >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {y.rateGainLossTWD >= 0 ? '+' : ''}NT$ {fmt(y.rateGainLossTWD)}
                  </div>
                </div>

                {expandedYear === y.year && (
                  <div className="bg-slate-50/40 border-t border-slate-100">
                    {/* Month sub-header */}
                    <div className="grid grid-cols-4 px-6 lg:px-14 py-2 text-[9px] font-black uppercase tracking-widest text-slate-300 min-w-[500px]">
                      <div>月份</div>
                      <div className="text-right">投入台幣</div>
                      <div className="text-right">兌換美金</div>
                      <div className="text-right">換匯成本</div>
                    </div>
                    {y.months.map(m => {
                      const monthIndex = parseInt(m.month.split('-')[1]) - 1;
                      return (
                        <div key={m.month} className="grid grid-cols-4 px-6 lg:px-14 py-3 border-t border-slate-100/50 text-xs lg:text-sm min-w-[500px]">
                          <div className="text-slate-600 font-semibold">{MONTH_LABELS[monthIndex]}</div>
                          <div className="text-right font-mono text-slate-700">NT$ {fmt(m.twdSpent)}</div>
                          <div className="text-right font-mono text-slate-700">${fmt(m.usdBought, 1)}</div>
                          <div className="text-right font-mono text-slate-500 text-xs">{m.effectiveRate.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Total row */}
            <div className="grid grid-cols-5 px-4 lg:px-8 py-4 lg:py-5 bg-slate-900 text-white font-black min-w-[500px] items-center">
              <div className="text-xs lg:text-sm">合計</div>
              <div className="text-right font-mono text-sm lg:text-base">NT$ {fmt(totalAll.twdSpent)}</div>
              <div className="text-right font-mono text-sm lg:text-base">${fmt(totalAll.usdBought, 1)}</div>
              <div className="text-right text-slate-400 text-[10px] lg:text-xs font-normal">加權平均<br />{(totalAll.twdSpent / (totalAll.usdBought || 1)).toFixed(2)}</div>
              <div className={`text-right font-mono text-sm lg:text-base ${totalAll.ratePL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalAll.ratePL >= 0 ? '+' : ''}NT$ {fmt(totalAll.ratePL)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
