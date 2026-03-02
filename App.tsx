
import React, { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { PurchaseRecords } from './components/PurchaseRecords';
import { RebalancingTool } from './components/RebalancingTool';
import { Forecast } from './components/Forecast';
import { PortfolioData, PurchaseRecord } from './types';
import { calculatePortfolio, getRecords, saveRecord, deleteRecord, saveBulkRecords } from './services/portfolioService';
import { NAV_ITEMS } from './constants';
import { Loader2, Zap } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [records, setRecords] = useState<PurchaseRecord[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = useCallback(async (force: boolean = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    
    const history = getRecords();
    setRecords(history);
    const data = await calculatePortfolio(history, force);
    setPortfolio(data);
    
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleAddRecord = async (record: Omit<PurchaseRecord, 'id'>) => {
    saveRecord(record);
    await refreshData();
  };

  const handleBulkAddRecords = async (newRecords: Omit<PurchaseRecord, 'id'>[]) => {
    saveBulkRecords(newRecords);
    await refreshData();
  };

  const handleDeleteRecord = async (id: string) => {
    deleteRecord(id);
    await refreshData();
  };

  const renderContent = () => {
    if (loading || !portfolio) {
      return (
        <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
          <Loader2 size={48} className="text-blue-600 animate-spin" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">正在計算投資組合分析...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard': return (
        <Dashboard 
          portfolio={portfolio} 
          onNavigate={setActiveTab} 
          onRefresh={() => refreshData(true)} 
          isRefreshing={refreshing}
        />
      );
      case 'records': return <PurchaseRecords records={records} onAdd={handleAddRecord} onDelete={handleDeleteRecord} onBulkAdd={handleBulkAddRecords} />;
      case 'rebalance': return <RebalancingTool portfolio={portfolio} />;
      case 'prediction': return <Forecast records={records} usdRate={portfolio.exchangeRate} />;
      default: return <Dashboard portfolio={portfolio} onNavigate={setActiveTab} onRefresh={() => refreshData(true)} isRefreshing={refreshing} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* Sidebar Navigation */}
      <aside className="lg:w-72 bg-white border-r border-slate-100 p-8 flex flex-col gap-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Zap size={24} />
          </div>
          <div>
            <span className="text-xl font-black text-slate-900 tracking-tighter">ZENFOLIO</span>
            <div className="text-[10px] uppercase font-black tracking-widest text-blue-600/50 -mt-1">智慧再平衡</div>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 ${
                activeTab === item.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' 
                  : 'text-slate-400 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {item.icon}
              <span className="font-bold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Beta 版本</p>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">資料存儲於瀏覽器 Session/Local，點擊更新可同步市價。</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 lg:p-12 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto pb-20">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
