
import React, { useState, useMemo } from 'react';
import { PurchaseRecord, Currency } from '../types';
import { SUPPORTED_SYMBOLS } from '../constants';
import { Plus, Trash2, Calendar, Tag, Info, FileText, X, Check, Filter } from 'lucide-react';

interface PurchaseRecordsProps {
  records: PurchaseRecord[];
  onAdd: (record: Omit<PurchaseRecord, 'id'>) => void;
  onDelete: (id: string) => void;
  onBulkAdd: (records: Omit<PurchaseRecord, 'id'>[]) => void;
}

export const PurchaseRecords: React.FC<PurchaseRecordsProps> = ({ records, onAdd, onDelete, onBulkAdd }) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("All");
  
  const [formData, setFormData] = useState<Omit<PurchaseRecord, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    symbol: SUPPORTED_SYMBOLS[0].value,
    price: 0,
    quantity: 0,
    currency: 'USD',
    type: 'BUY'
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
    if (selectedYear === "All") return list;
    return list.filter(r => new Date(r.date).getFullYear().toString() === selectedYear);
  }, [records, selectedYear]);

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
            <FileText size={14} /> 批次匯入 Excel
          </button>
        </div>
      </div>

      {isImportOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-800">批次匯入資料</h3>
                <p className="text-xs text-slate-400 mt-1">直接從 Excel 貼上</p>
              </div>
              <button onClick={() => setIsImportOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-8 space-y-4">
              <textarea 
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="2025/1/22 0050 406 52.87 TWD..."
                className="w-full h-64 p-6 bg-slate-50 border-none rounded-3xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
              <button onClick={handleProcessImport} disabled={!importText.trim()} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                <Check size={20} /> 解析並匯入
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={(e) => { e.preventDefault(); if (formData.price > 0 && formData.quantity > 0) onAdd(formData); }} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5 sticky top-8">
            <h3 className="text-xl font-bold text-slate-800 mb-2">單筆新增</h3>
            <div className="space-y-4">
              <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" />
              <select value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value, currency: e.target.value.endsWith('.TW') ? 'TWD' : 'USD' })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm">
                {SUPPORTED_SYMBOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="any" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" placeholder="單價" />
                <input type="number" step="any" value={formData.quantity || ''} onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" placeholder="數量" />
              </div>
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                <Plus size={20} /> 新增
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">日期</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">標的</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">交易詳情</th>
                    <th className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold">總額</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-8 py-5 text-sm text-slate-600">{r.date}</td>
                      <td className="px-8 py-5">
                        <div className="font-bold text-slate-800">{r.symbol}</div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="text-xs text-slate-500">價: {r.currency === 'TWD' ? 'NT$' : '$'}{safeFormat(r.price)} | 量: {safeFormat(r.quantity)}</div>
                      </td>
                      <td className="px-8 py-5 font-mono font-bold text-slate-800">
                        {r.currency === 'TWD' ? 'NT$' : '$'}{safeFormat(r.price * r.quantity, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-8 py-5 text-right"><button onClick={() => onDelete(r.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={18} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
