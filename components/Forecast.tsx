
import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PurchaseRecord, PredictionPoint } from '../types';
import { generatePrediction } from '../services/portfolioService';
import { TrendingUp, Percent, Calendar, Sparkles } from 'lucide-react';

interface ForecastProps {
  records: PurchaseRecord[];
  usdRate: number;
}

export const Forecast: React.FC<ForecastProps> = ({ records, usdRate }) => {
  const [annualROI, setAnnualROI] = useState(8);
  const [forecastYears, setForecastYears] = useState(20);

  const data = useMemo(() => 
    generatePrediction(records || [], usdRate || 32.4, annualROI, forecastYears),
    [records, usdRate, annualROI, forecastYears]
  );

  const latest = data.length > 0 ? data[data.length - 1] : { portfolioValue: 0, cumulativeInvestment: 0, gainLoss: 0 };
  
  const formatter = (value: number) => {
    if (value === undefined || value === null || isNaN(value)) return "NT$ 0M";
    return `NT$ ${(value / 1000000).toFixed(1)}M`;
  };

  const safeFormatNum = (val: number | undefined) => {
    if (val === undefined || val === null || isNaN(val)) return "0.00";
    return (val / 1000000).toFixed(2);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">資產成長預測</h1>
          <p className="text-slate-500 font-medium">視覺化您通往財務自由的未來曲線</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <h3 className="text-xl font-bold text-slate-800">預測參數設定</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 flex items-center gap-1">
                  <Percent size={12} /> 預期年化報酬率
                </label>
                <span className="text-sm font-black font-mono text-blue-600">{annualROI}%</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="30" 
                value={annualROI}
                onChange={(e) => setAnnualROI(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                <span>保守型 (5%)</span>
                <span>積極型 (15%+)</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-widest font-black text-slate-400 flex items-center gap-1">
                  <Calendar size={12} /> 預測年限
                </label>
                <span className="text-sm font-black font-mono text-blue-600">{forecastYears} 年</span>
              </div>
              <input 
                type="range" 
                min="5" 
                max="50" 
                value={forecastYears}
                onChange={(e) => setForecastYears(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
            <Sparkles className="absolute -right-4 -top-4 w-24 h-24 opacity-10 rotate-12" />
            <h4 className="text-sm font-bold uppercase tracking-widest opacity-80 mb-2">{forecastYears} 年後的資產估計</h4>
            <div className="text-3xl font-black font-mono tracking-tighter mb-4">
              NT$ {safeFormatNum(latest.portfolioValue)} 百萬
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs opacity-70">
                <span>累積投入本金</span>
                <span className="font-mono">NT$ {safeFormatNum(latest.cumulativeInvestment)}M</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-green-300">
                <span>累積複利增長</span>
                <span className="font-mono">NT$ {safeFormatNum(latest.gainLoss)}M</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-800">長期資產成長趨勢</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">總市值</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">投入本金</span>
              </div>
            </div>
          </div>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="year" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }}
                  tickFormatter={formatter}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '1.25rem' }}
                  formatter={(value: number) => {
                    if (isNaN(value)) return ["NT$ 0M", ""];
                    return [`NT$ ${(value/1000000).toFixed(2)} 百萬`, ''];
                  }}
                />
                <Area 
                  type="monotone" 
                  name="預估總市值"
                  dataKey="portfolioValue" 
                  stroke="#2563EB" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                />
                <Area 
                  type="monotone" 
                  name="累積投入本金"
                  dataKey="cumulativeInvestment" 
                  stroke="#E2E8F0" 
                  strokeWidth={2}
                  fillOpacity={0} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
