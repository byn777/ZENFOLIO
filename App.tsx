
import React, { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { PurchaseRecords } from './components/PurchaseRecords';
import { RebalancingTool } from './components/RebalancingTool';
import { Forecast } from './components/Forecast';
import { AnnualCostAnalysis } from './components/AnnualCostAnalysis';
import { PortfolioData, PurchaseRecord, TargetAllocation } from './types';
import { calculatePortfolio, getRecords, saveRecord, deleteRecord, updateRecord, saveBulkRecords, getTargetAllocations } from './services/portfolioService';
import { NAV_ITEMS, SUPPORTED_SYMBOLS } from './constants';
import { CATEGORY_LABELS, AssetCategory } from './constants';
import { Loader2, Zap, DollarSign, Cloud, LogOut } from 'lucide-react';
import DEMO_RECORDS from './sample_data.json';
import { supabase } from './services/supabaseClient';
import { Session } from '@supabase/supabase-js';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [records, setRecords] = useState<PurchaseRecord[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [targets, setTargets] = useState<TargetAllocation[]>(() => {
    const saved = getTargetAllocations();
    if (saved && saved.length > 0) return saved;
    return SUPPORTED_SYMBOLS.map(s => ({ symbol: s.value, percent: 0 }));
  });
  const [budgetTWD, setBudgetTWD] = useState<number>(50000);
  const [mergedClusters, setMergedClusters] = useState<Record<string, string[]>>({});
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'TWD'>('USD');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  const refreshData = useCallback(async (force: boolean = false, demo: boolean = isDemoMode) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    
    const mappedDemoRecords = (DEMO_RECORDS as any[]).map((r, i) => ({ ...r, id: `demo-${i}` })) as PurchaseRecord[];
    const history = demo ? mappedDemoRecords : await getRecords();
    
    setRecords(history);
    const data = await calculatePortfolio(history, force);
    setPortfolio(data);
    
    setLoading(false);
    setRefreshing(false);
  }, [isDemoMode]);

  const handleToggleDemo = (newDemoState: boolean) => {
    setIsDemoMode(newDemoState);
    refreshData(false, newDemoState);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      refreshData();
    });
    return () => subscription.unsubscribe();
  }, [refreshData]);

  const handleAddRecord = async (record: Omit<PurchaseRecord, 'id'>) => {
    await saveRecord(record);
    await refreshData();
  };

  const handleBulkAddRecords = async (newRecords: Omit<PurchaseRecord, 'id'>[]) => {
    await saveBulkRecords(newRecords);
    await refreshData();
  };

  const handleDeleteRecord = async (id: string) => {
    await deleteRecord(id);
    await refreshData();
  };

  const handleEditRecord = async (record: import('./types').PurchaseRecord) => {
    await updateRecord(record);
    await refreshData();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = isRegistering 
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    
    if (error) setAuthError(error.message);
    else {
      setShowAuthModal(false);
      setAuthPassword('');
    }
  };

  const handleClearAllData = () => {
    localStorage.removeItem('zenfolio_purchase_records_v2');
    localStorage.removeItem('zenfolio_purchase_records');
    localStorage.removeItem('zenfolio_target_allocations_v2');
    sessionStorage.removeItem('zenfolio_live_prices_v2');
    setRecords([]);
    setShowClearConfirm(false);
    refreshData();
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
          records={records}
          displayCurrency={displayCurrency}
          onToggleCurrency={() => setDisplayCurrency(prev => prev === 'USD' ? 'TWD' : 'USD')}
          onNavigate={setActiveTab} 
          onRefresh={() => refreshData(true)} 
          isRefreshing={refreshing}
        />
      );
      case 'records': return <PurchaseRecords records={records} onAdd={handleAddRecord} onDelete={handleDeleteRecord} onEdit={handleEditRecord} onBulkAdd={handleBulkAddRecords} />;
      case 'rebalance': return <RebalancingTool portfolio={portfolio} targets={targets} setTargets={setTargets} budgetTWD={budgetTWD} setBudgetTWD={setBudgetTWD} mergedClusters={mergedClusters} setMergedClusters={setMergedClusters} />;
      case 'prediction': return <Forecast records={records} usdRate={portfolio.exchangeRate} portfolioValueUSD={portfolio.totalMarketValueUSD} />;
      case 'annual': return <AnnualCostAnalysis records={records} currentExchangeRate={portfolio.exchangeRate} />;
      default: return <Dashboard portfolio={portfolio} onNavigate={setActiveTab} onRefresh={() => refreshData(true)} isRefreshing={refreshing} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* Mobile Top Header (Hidden on Desktop) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-md border-b border-slate-100 z-40 px-5 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-200">
            <Zap size={18} />
          </div>
          <span className="text-lg font-black text-slate-900 tracking-tighter">ZENFOLIO</span>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={() => handleToggleDemo(!isDemoMode)}
             className={`w-9 h-5 rounded-full transition-colors relative shadow-inner ${isDemoMode ? 'bg-blue-600' : 'bg-slate-300'}`}
           >
             <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isDemoMode ? 'translate-x-4' : 'translate-x-0'} shadow-sm`} />
           </button>
           {session ? (
              <button onClick={() => supabase.auth.signOut()} className="text-[10px] text-slate-400 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl"><LogOut size={16} /></button>
           ) : (
              <button onClick={() => setShowAuthModal(true)} className="text-[10px] text-blue-600 font-bold p-2 bg-blue-50 hover:bg-blue-100 rounded-xl"><Cloud size={16} /></button>
           )}
        </div>
      </header>

      {/* Desktop Sidebar Navigation (Hidden on Mobile) */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-100 p-8 flex-col gap-10 sticky top-0 h-screen overflow-y-auto">
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

        <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Beta 版本</p>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">資料存儲於瀏覽器 Session/Local，點擊更新可同步市價。</p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200/60 mt-2">
            <span className="text-xs font-bold text-slate-700">展示模式 (Demo)</span>
            <button 
              onClick={() => handleToggleDemo(!isDemoMode)}
              className={`w-10 h-6 rounded-full transition-colors relative shadow-inner ${isDemoMode ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isDemoMode ? 'translate-x-4' : 'translate-x-0'} shadow-sm`} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200/60 mt-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Cloud size={14} className={session ? "text-green-500" : "text-slate-400"} /> 雲端同步</span>
            {session ? (
               <button onClick={() => supabase.auth.signOut()} className="text-[10px] text-red-500 font-bold px-3 py-1.5 bg-red-50 hover:bg-red-100 transition-colors rounded-lg flex items-center gap-1">
                 <LogOut size={12} /> 登出
               </button>
            ) : (
               <button onClick={() => setShowAuthModal(true)} className="text-[10px] text-blue-600 font-bold px-3 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg">登入</button>
            )}
          </div>
          {session && <p className="text-[10px] font-bold text-green-600 truncate opacity-80">{session.user.email}</p>}

          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-[10px] text-left text-slate-300 hover:text-red-400 transition-colors font-medium tracking-wide mt-2"
          >
            進階設定 (清空在地資料)…
          </button>
        </div>
      </aside>

      {/* Danger: Clear All Data Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-sm w-full mx-4 border-2 border-red-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 text-2xl">⚠️</div>
              <h2 className="text-xl font-black text-slate-900">清空所有資料</h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-2">
              此操作將永久刪除您所有的購買紀錄、目標配置和市價緩存。
            </p>
            <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-8">此操作無法復原！</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClearAllData}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                確認清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 pt-24 pb-28 lg:p-12 lg:pb-12 overflow-y-auto min-h-screen">
        <div className="max-w-6xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Mobile Bottom Navigation (Hidden on Desktop) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 z-50 px-2 py-2 flex items-center justify-around pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 p-2 min-w-[64px] rounded-2xl transition-all ${
              activeTab === item.id 
                ? 'text-blue-600' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${activeTab === item.id ? 'bg-blue-50 text-blue-600 scale-110' : ''}`}>
              {React.cloneElement(item.icon as React.ReactElement, { size: 20 })}
            </div>
            <span className={`text-[9px] font-bold ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`}>{item.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>
      {/* Cloud Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-sm w-full animate-slide-up">
            <h2 className="text-2xl font-black text-slate-900 mb-2">{isRegistering ? '註冊雲端帳號' : '登入雲端同步'}</h2>
            <p className="text-xs text-slate-500 mb-6">利用 Supabase 連線，保障您的跨裝置資料安全。</p>
            
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <input type="email" placeholder="信箱" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" />
              </div>
              <div>
                <input type="password" placeholder="密碼 (最少 6 字元)" required minLength={6} value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm" />
              </div>
              
              {authError && <p className="text-xs text-red-500 font-bold bg-red-50 p-3 rounded-xl">{authError}</p>}
              
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition">
                {isRegistering ? '立即註冊' : '確認登入'}
              </button>
            </form>
            
            <div className="mt-6 flex flex-col gap-3">
              <button onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition">
                {isRegistering ? '已有帳號？點此登入' : '還沒有帳號？立即註冊'}
              </button>
              <button onClick={() => setShowAuthModal(false)} className="text-xs font-bold text-slate-300 hover:text-slate-500 transition">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default App;
