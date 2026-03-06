import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { PurchaseRecord, Currency } from '../types';
import { SUPPORTED_SYMBOLS } from '../constants';
import { fetchCurrentPrices } from '../services/portfolioService';
import { Plus, Trash2, TrendingUp, Calendar, DollarSign, ArrowUpDown, ChevronDown, Check, X, FileText, Search, Pencil } from 'lucide-react';
import { SymbolSelect } from './SymbolSelect';

interface PurchaseRecordsProps {
  records: PurchaseRecord[];
  onAdd: (record: Omit<PurchaseRecord, 'id'>) => void;
  onDelete: (id: string) => void;
  onEdit: (record: PurchaseRecord) => void;
  onBulkAdd: (records: Omit<PurchaseRecord, 'id'>[]) => void;
}

export const PurchaseRecords: React.FC<PurchaseRecordsProps> = ({ records, onAdd, onDelete, onEdit, onBulkAdd }) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingRecord, setEditingRecord] = useState<PurchaseRecord | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("All");
  const [sortField, setSortField] = useState<keyof PurchaseRecord>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [formData, setFormData] = useState<Omit<PurchaseRecord, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    symbol: SUPPORTED_SYMBOLS[0].value,
    price: 0,
    quantity: 0,
    currency: 'USD',
    type: 'BUY',
    twdCost: undefined
  });

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    (records || []).forEach(r => {
      if (!r.date) return;
      const year = new Date(r.date).getFullYear().toString();
      if (!isNaN(parseInt(year)) && year.length === 4) years.add(year);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const list = records || [];
    const byYear = selectedYear === "All" ? list : list.filter(r => new Date(r.date).getFullYear().toString() === selectedYear);
    return selectedSymbol === "All" ? byYear : byYear.filter(r => r.symbol === selectedSymbol);
  }, [records, selectedYear, selectedSymbol]);

  const availableSymbolsForYear = useMemo(() => {
    const base = selectedYear === 'All' ? (records || []) : (records || []).filter(r => new Date(r.date).getFullYear().toString() === selectedYear);
    return Array.from(new Set(base.map(r => r.symbol))).sort();
  }, [records, selectedYear]);

  // Auto-fill price when symbol changes
  useEffect(() => {
    if (formData.symbol) {
      // Assuming a loading state isn't strictly necessary for a background pre-fill
      fetchCurrentPrices([formData.symbol]).then(prices => {
        const price = prices[formData.symbol];
        if (price) {
          setFormData(prev => ({ ...prev, price: parseFloat(price.toFixed(2)) }));
        }
      }).catch(err => console.log('Failed to pre-fill price', err));
    }
  }, [formData.symbol]);

  const handleProcessImport = () => {
    const lines = importText.split('\n');
    const newRecords: Omit<PurchaseRecord, 'id'>[] = [];

    lines.forEach(line => {
      const parts = line.trim().split(/[\t\s]+/).map(p => p.trim());
      if (parts.length < 3) return;

      // 日期處理
      let date = parts[0].replace(/\//g, '-');
      const dateParts = date.split('-');
      if (dateParts.length === 3) {
        const y = dateParts[0];
        const m = dateParts[1].padStart(2, '0');
        const d = dateParts[2].padStart(2, '0');
        date = `${y}-${m}-${d}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

      // 標的正規化
      let symbol = parts[1].toUpperCase();
      if (symbol === "0050") symbol = "0050.TW";
      if (symbol === "006208") symbol = "006208.TW";
      if (symbol === "2330") symbol = "2330.TW";
      if (symbol === "BTC") symbol = "BTC-USD";
      if (symbol === "ETH") symbol = "ETH-USD";
      if (symbol === "BND") symbol = "BND";
      
      if (!SUPPORTED_SYMBOLS.some(s => s.value === symbol)) return;

      const quantity = parseFloat(parts[2].replace(/,/g, ''));
      const price = parseFloat(parts[3].replace(/,/g, ''));
      let currency: Currency = parts[4]?.toUpperCase() as Currency || (symbol.endsWith('.TW') ? 'TWD' : 'USD');

      if (isNaN(quantity) || isNaN(price)) return;

      newRecords.push({ date, symbol, price, quantity, currency, type: "BUY" });
    });

    if (newRecords.length > 0) {
      onBulkAdd(newRecords);
      setIsImportOpen(false);
      setImportText("");
    }
  };

  const handleJsonFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) { alert('格式錯誤：須為陣列格式'); return; }
        const newRecords: Omit<PurchaseRecord, 'id'>[] = [];
        data.forEach((r: any) => {
          const symbol = r.symbol?.toUpperCase()
            ?.replace(/^0050$/, '0050.TW')
            ?.replace(/^006208$/, '006208.TW')
            ?.replace(/^2330$/, '2330.TW');
          if (!symbol || !SUPPORTED_SYMBOLS.some(s => s.value === symbol)) return;
          const price = parseFloat(r.price);
          const quantity = parseFloat(r.quantity);
          const twdCost = r.twdCost ? parseFloat(r.twdCost) : undefined;
          const currency = (r.currency?.toUpperCase() === 'TWD' ? 'TWD' : 'USD') as Currency;
          const type = r.type === 'SELL' ? 'SELL' : 'BUY';
          const date = r.date?.replace(/\//g, '-');
          if (!date || isNaN(price) || isNaN(quantity)) return;
          newRecords.push({ date, symbol, price, quantity, currency, type, twdCost });
        });
        if (newRecords.length > 0) {
          onBulkAdd(newRecords);
          setIsImportOpen(false);
        } else {
          alert(`找不到有效資料，請確認 JSON 格式正確`);
        }
      } catch {
        alert('解析 JSON 失敗，請檢查檔案格式');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const safeFormat = (val: number | undefined, options?: Intl.NumberFormatOptions) => {
    if (val === undefined || val === null || isNaN(val)) return "0";
    return val.toLocaleString(undefined, options);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">投資紀錄管理</h1>
          <p className="text-slate-500 font-medium">記錄您的每一筆交易資訊</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsImportOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
            <FileText size={14} /> 批次匙入
          </button>
        </div>
        {/* Hidden JSON file input */}
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleJsonFileImport} />
      </div>

      {isImportOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">批次匯入資料</h3>
                <p className="text-xs text-slate-400 mt-1">貼上 Excel 資料 或 選擇 JSON 檔案</p>
              </div>
              <button onClick={() => setIsImportOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-8 space-y-4">
              <textarea 
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="2025/1/22	VWRA.L	3.5	128.50	USD&#10;2025/1/22	006208	60	81.40	TWD"
                className="w-full h-48 p-6 bg-slate-50 border-none rounded-3xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText size={16} /> 選擇 JSON 檔案
                </button>
                <button onClick={handleProcessImport} disabled={!importText.trim()} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Check size={20} /> 解析並匙入
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={(e) => { e.preventDefault(); if (formData.price > 0 && formData.quantity > 0) onAdd(formData); }} className="bg-white p-5 lg:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5 lg:sticky lg:top-8">
            <h3 className="text-xl font-bold text-slate-800 mb-2">單筆新增</h3>
            <div className="space-y-4">
              <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" />
              <div className="relative z-50">
                <SymbolSelect 
                  value={formData.symbol} 
                  onChange={(val) => setFormData({ 
                    ...formData, 
                    symbol: val, 
                    currency: val.endsWith('.TW') ? 'TWD' : (val.endsWith('.L') ? 'USD' : 'USD') // Note: VUSA/VWRL on London are often USD or GBP, assuming USD for simplicity based on mock prices
                  })} 
                />
              </div>
              <div className="grid grid-cols-1 gap-4 relative z-0">
                <div className="relative">
                  <span className="absolute left-4 top-3 text-slate-400 font-bold">$</span>
                  <input type="number" step="any" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} className="w-full pl-8 pr-12 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono" placeholder="單價 (可自行修改)" />
                  {formData.price > 0 && (
                    <button type="button" onClick={() => setFormData({ ...formData, price: 0 })} className="absolute right-4 top-3 text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <input type="number" step="any" value={formData.quantity || ''} onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono" placeholder="數量" />
              </div>
              {formData.currency === 'USD' && (
                <div className="relative z-0">
                  <span className="absolute left-4 top-3 text-slate-400 font-bold">NT$</span>
                  <input type="number" step="any" value={formData.twdCost || ''} onChange={(e) => setFormData({ ...formData, twdCost: parseFloat(e.target.value) })} className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono" placeholder="花費台幣 (選填，精確計算匯差)" />
                </div>
              )}
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                <Plus size={20} /> 新增
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {/* Year Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {['All', ...availableYears].map(year => (
              <button
                key={year}
                onClick={() => { setSelectedYear(year); setSelectedSymbol('All'); }}
                className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                  selectedYear === year
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                    : 'bg-white border border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                {year === 'All' ? '全部' : `${year}年`}
                <span className="ml-1 opacity-60">
                  {year === 'All'
                    ? records.length
                    : records.filter(r => new Date(r.date).getFullYear().toString() === year).length}
                </span>
              </button>
            ))}
          </div>

          {/* Symbol Sub-filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">標的</span>
            {['All', ...availableSymbolsForYear].map(sym => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                  selectedSymbol === sym
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-700'
                }`}
              >
                {sym === 'All' ? '全部標的' : sym}
                <span className="ml-1 opacity-50">
                  {sym === 'All'
                    ? (selectedYear === 'All' ? records.length : records.filter(r => new Date(r.date).getFullYear().toString() === selectedYear).length)
                    : records.filter(r => r.symbol === sym && (selectedYear === 'All' || new Date(r.date).getFullYear().toString() === selectedYear)).length}
                </span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">日期</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">標的</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">交易詳情</th>
                      <th className="px-4 lg:px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">總額</th>
                      <th className="px-4 lg:px-8 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-4 lg:px-8 py-4 lg:py-5 text-sm text-slate-600 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{r.symbol}</div>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            r.type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>{r.type === 'BUY' ? '買入' : '賣出'}</span>
                        </td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5 whitespace-nowrap">
                          <div className="text-xs text-slate-500">價: {r.currency === 'TWD' ? 'NT$' : '$'}{safeFormat(r.price)} | 量: {safeFormat(r.quantity)}</div>
                          {r.currency === 'USD' && r.twdCost ? (
                            <div className="text-[10px] text-slate-400 mt-1">實付: NT${safeFormat(r.twdCost, { maximumFractionDigits: 0 })}</div>
                          ) : null}
                        </td>
                        <td className={`px-4 lg:px-8 py-4 lg:py-5 font-mono font-bold whitespace-nowrap ${r.type === 'SELL' ? 'text-red-600' : 'text-slate-800'}`}>
                          {r.type === 'SELL' ? '-' : ''}{r.currency === 'TWD' ? 'NT$' : '$'}{safeFormat(r.price * r.quantity, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 lg:px-8 py-4 lg:py-5 text-right whitespace-nowrap">
                          <button onClick={() => setEditingRecord({ ...r })} className="p-2 text-slate-300 hover:text-blue-500 transition-all mr-1"><Pencil size={15} /></button>
                          <button onClick={() => onDelete(r.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      </div>

      {/* Edit Record Modal */}
      {editingRecord && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">修改紀錄</h3>
                <p className="text-xs text-slate-400 mt-1">{editingRecord.symbol}</p>
              </div>
              <button onClick={() => setEditingRecord(null)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">日期</label>
                <input
                  type="date"
                  value={editingRecord.date}
                  onChange={e => setEditingRecord({ ...editingRecord, date: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">單價 ({editingRecord.currency})</label>
                <input
                  type="number" step="any"
                  value={editingRecord.price}
                  onChange={e => setEditingRecord({ ...editingRecord, price: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">數量</label>
                <input
                  type="number" step="any"
                  value={editingRecord.quantity}
                  onChange={e => setEditingRecord({ ...editingRecord, quantity: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono"
                />
              </div>
              {editingRecord.currency === 'USD' && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">花費台幣 (選填)</label>
                  <input
                    type="number" step="any"
                    value={editingRecord.twdCost || ''}
                    onChange={e => setEditingRecord({ ...editingRecord, twdCost: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-mono"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">類型</label>
                <div className="flex gap-2">
                  {(['BUY', 'SELL'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setEditingRecord({ ...editingRecord, type: t })}
                      className={`flex-1 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${editingRecord.type === t ? (t === 'BUY' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-400'}`}
                    >{t === 'BUY' ? '買入' : '賣出'}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors"
                >取消</button>
                <button
                  onClick={() => { onEdit(editingRecord); setEditingRecord(null); }}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                ><Check size={16} /> 儲存</button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};
