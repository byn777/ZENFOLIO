
import { PurchaseRecord, SymbolHolding, PortfolioData, PredictionPoint, TargetAllocation } from '../types';
import { MOCK_PRICES, SUPPORTED_SYMBOLS } from '../constants';
import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = 'zenfolio_purchase_records_v2'; // 使用新 Key 確保資料遷移
const TARGETS_KEY = 'zenfolio_target_allocations_v2';
const PRICE_CACHE_KEY = 'zenfolio_live_prices_v2';

export const getRecords = (): PurchaseRecord[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    // 嘗試從舊版讀取
    const oldData = localStorage.getItem('zenfolio_purchase_records');
    return oldData ? JSON.parse(oldData) : [];
  }
  return JSON.parse(data);
};

export const saveRecord = (record: Omit<PurchaseRecord, 'id'>) => {
  const records = getRecords();
  const newRecord = { ...record, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, newRecord]));
  return newRecord;
};

export const saveBulkRecords = (newRecords: Omit<PurchaseRecord, 'id'>[]) => {
  const records = getRecords();
  const formatted = newRecords.map(r => ({
    ...r,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }));
  const updated = [...records, ...formatted];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const deleteRecord = (id: string) => {
  const records = getRecords();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.filter(r => r.id !== id)));
};

export const getTargetAllocations = (): TargetAllocation[] => {
  const data = localStorage.getItem(TARGETS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTargetAllocations = (targets: TargetAllocation[]) => {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
};

const getCachedPrices = (): { prices: Record<string, number>, timestamp: string } | null => {
  const cached = sessionStorage.getItem(PRICE_CACHE_KEY);
  return cached ? JSON.parse(cached) : null;
};

export const fetchCurrentPrices = async (symbols: string[], forceRefresh: boolean = false): Promise<Record<string, number>> => {
  const cached = getCachedPrices();
  if (!forceRefresh && cached) return cached.prices;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const uniqueSymbols = Array.from(new Set([...symbols, "USDTWD=X"]));
  
  try {
    const prompt = `請提供以下標的的最新成交價 JSON 格式：${uniqueSymbols.join(', ')}。台股標的(.TW)給台幣，美股/加密貨幣給美金，匯率(USDTWD=X)給 1 USD 兌台幣。格式：{"BTC-USD": 95000, "VT": 115.2, "USDTWD=X": 32.4}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const result = JSON.parse(response.text || "{}");
    const finalPrices = { ...MOCK_PRICES, ...result };
    sessionStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ prices: finalPrices, timestamp: new Date().toISOString() }));
    return finalPrices;
  } catch (error) {
    console.error("Failed to fetch live prices:", error);
    return cached?.prices || MOCK_PRICES;
  }
};

export const calculatePortfolio = async (records: PurchaseRecord[], forceRefresh: boolean = false): Promise<PortfolioData> => {
  const activeSymbols = Array.from(new Set(records.map(r => r.symbol)));
  const prices = await fetchCurrentPrices(activeSymbols, forceRefresh);
  const usdRate = prices["USDTWD=X"] || 32.42;

  const symbolMap = new Map<string, { qty: number; costUSD: number }>();

  records.forEach(r => {
    const current = symbolMap.get(r.symbol) || { qty: 0, costUSD: 0 };
    const priceInUSD = r.currency === "TWD" ? r.price / usdRate : r.price;
    const costInUSD = priceInUSD * r.quantity;
    
    if (r.type === "BUY") {
      symbolMap.set(r.symbol, {
        qty: current.qty + r.quantity,
        costUSD: current.costUSD + costInUSD
      });
    } else {
      symbolMap.set(r.symbol, {
        qty: Math.max(0, current.qty - r.quantity),
        costUSD: Math.max(0, current.costUSD - costInUSD) 
      });
    }
  });

  let totalMarketValueUSD = 0;
  let totalCostUSD = 0;
  const holdings: SymbolHolding[] = [];

  symbolMap.forEach((data, symbol) => {
    if (data.qty <= 0) return;

    let currentPriceUSD = prices[symbol] || MOCK_PRICES[symbol] || 0;
    if (symbol.endsWith('.TW')) {
      currentPriceUSD = currentPriceUSD / usdRate;
    }

    const marketValue = data.qty * currentPriceUSD;
    totalMarketValueUSD += marketValue;
    totalCostUSD += data.costUSD;

    const symbolConfig = SUPPORTED_SYMBOLS.find(s => s.value === symbol);

    holdings.push({
      symbol,
      category: symbolConfig?.category || 'OTHER',
      totalQuantity: data.qty,
      totalCostUSD: data.costUSD,
      currentPrice: currentPriceUSD,
      currentMarketValueUSD: marketValue,
      currentPercent: 0, 
      gainUSD: marketValue - data.costUSD,
      gainPercent: data.costUSD > 0 ? ((marketValue - data.costUSD) / data.costUSD) * 100 : 0
    });
  });

  holdings.forEach(h => {
    h.currentPercent = totalMarketValueUSD > 0 ? (h.currentMarketValueUSD / totalMarketValueUSD) * 100 : 0;
  });

  return {
    holdings: holdings.sort((a, b) => b.currentMarketValueUSD - a.currentMarketValueUSD),
    totalMarketValueUSD,
    totalCostUSD,
    exchangeRate: usdRate,
    timestamp: new Date().toISOString()
  };
};

export const generatePrediction = (
  records: PurchaseRecord[], 
  usdRate: number, 
  annualROI: number, 
  years: number = 20
): PredictionPoint[] => {
  const yearlyInvestments: Record<number, number> = {};
  let startYear = new Date().getFullYear();

  records.forEach(r => {
    const year = new Date(r.date).getFullYear();
    const amountTWD = r.currency === "TWD" ? r.price * r.quantity : r.price * r.quantity * usdRate;
    yearlyInvestments[year] = (yearlyInvestments[year] || 0) + (r.type === "BUY" ? amountTWD : -amountTWD);
    if (year < startYear && year > 1900) startYear = year;
  });

  const prediction: PredictionPoint[] = [];
  let portfolioValue = 0;
  let cumulativeInvestment = 0;

  for (let i = 0; i <= years; i++) {
    const currentYear = startYear + i;
    const isFuture = currentYear > new Date().getFullYear();
    const annualInvest = isFuture ? 0 : (yearlyInvestments[currentYear] || 0); // 保守不預設未來投入
    
    cumulativeInvestment += annualInvest;
    portfolioValue = (portfolioValue + annualInvest) * (1 + annualROI / 100);

    prediction.push({
      year: currentYear,
      cumulativeInvestment,
      portfolioValue,
      gainLoss: portfolioValue - cumulativeInvestment,
      gainLossPercent: cumulativeInvestment > 0 ? ((portfolioValue - cumulativeInvestment) / cumulativeInvestment) * 100 : 0
    });
  }

  return prediction;
};
