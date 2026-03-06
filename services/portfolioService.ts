
import { PurchaseRecord, SymbolHolding, PortfolioData, PredictionPoint, TargetAllocation } from '../types';
import { MOCK_PRICES, SUPPORTED_SYMBOLS } from '../constants';
import { GoogleGenAI } from "@google/genai";
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'zenfolio_purchase_records_v2'; // 使用新 Key 確保資料遷移
const TARGETS_KEY = 'zenfolio_target_allocations_v2';
const PRICE_CACHE_KEY = 'zenfolio_live_prices_v2';

const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getRecords = async (): Promise<PurchaseRecord[]> => {
  const user = await getUser();
  if (user) {
    const { data, error } = await supabase.from('purchase_records').select('*').order('date', { ascending: false });
    if (!error && data) {
      return data.map(d => ({
        id: d.id,
        date: d.date,
        symbol: d.symbol,
        price: parseFloat(d.price),
        quantity: parseFloat(d.quantity),
        currency: d.currency as 'USD' | 'TWD',
        type: d.type as "BUY" | "SELL",
        twdCost: d.twd_cost ? parseFloat(d.twd_cost) : undefined
      }));
    }
  }

  // Fallback
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    const oldData = localStorage.getItem('zenfolio_purchase_records');
    return oldData ? JSON.parse(oldData) : [];
  }
  return JSON.parse(data);
};

export const saveRecord = async (record: Omit<PurchaseRecord, 'id'>) => {
  const user = await getUser();
  if (user) {
    const { data, error } = await supabase.from('purchase_records').insert({
      user_id: user.id,
      date: record.date,
      symbol: record.symbol,
      price: record.price,
      quantity: record.quantity,
      currency: record.currency,
      type: record.type,
      twd_cost: record.twdCost
    }).select().single();
    if (!error && data) return { ...record, id: data.id };
  }
  
  const records = await getRecords();
  const newRecord = { ...record, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, newRecord]));
  return newRecord;
};

export const saveBulkRecords = async (newRecords: Omit<PurchaseRecord, 'id'>[]) => {
  const user = await getUser();
  if (user) {
    const inserts = newRecords.map(record => ({
      user_id: user.id,
      date: record.date,
      symbol: record.symbol,
      price: record.price,
      quantity: record.quantity,
      currency: record.currency,
      type: record.type,
      twd_cost: record.twdCost
    }));
    await supabase.from('purchase_records').insert(inserts);
    return;
  }

  const records = await getRecords();
  const formatted = newRecords.map(r => ({
    ...r,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, ...formatted]));
};

export const deleteRecord = async (id: string) => {
  const user = await getUser();
  if (user) {
    await supabase.from('purchase_records').delete().eq('id', id);
    return;
  }
  const records = await getRecords();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.filter(r => r.id !== id)));
};

export const updateRecord = async (updated: PurchaseRecord) => {
  const user = await getUser();
  if (user) {
    await supabase.from('purchase_records').update({
      date: updated.date,
      symbol: updated.symbol,
      price: updated.price,
      quantity: updated.quantity,
      currency: updated.currency,
      type: updated.type,
      twd_cost: updated.twdCost
    }).eq('id', updated.id);
    return;
  }
  const records = await getRecords();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(r => r.id === updated.id ? updated : r)));
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

  const uniqueSymbols = Array.from(new Set([...symbols, "USDTWD=X"]));
  const finalPrices: Record<string, number> = { ...MOCK_PRICES };
  
  try {
    await Promise.all(uniqueSymbols.map(async (symbol) => {
      try {
        const isProd = import.meta.env.PROD;
        const endpoint = isProd 
          ? `/api/yahoo-proxy?symbol=${symbol}` 
          : `/api/yahoo/v8/finance/chart/${symbol}?interval=1d&range=1d`;
          
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // Vercel output maps the data slightly differently or same depending on proxy structure
        // Since my Vercel proxy returns exactly the data from Yahoo, we maintain standard logic:
        const result = data?.chart?.result?.[0];
        if (result && result.meta && result.meta.regularMarketPrice) {
          finalPrices[symbol] = result.meta.regularMarketPrice;
        }
      } catch (err) {
        console.warn(`Failed to fetch Yahoo Finance price for ${symbol}:`, err);
      }
    }));

    sessionStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ prices: finalPrices, timestamp: new Date().toISOString() }));
    return finalPrices;
  } catch (error) {
    console.warn("Fatal error fetching prices. Using available/mock prices:", error);
    return cached?.prices || finalPrices;
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
  years: number = 20,
  currentPortfolioValueTWD: number = 0,
  monthlyContributionTWD: number = 0
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

  const currentYearNow = new Date().getFullYear();

  // 1. Calculate historical cumulative investments year by year
  let runningCumulative = 0;
  let runningBaseline = 0;
  
  // To make the historical portfolio value line look somewhat realistic before it snaps to the true current value,
  // we'll just approximate it growing at the user's expected ROI, or just the baseline.
  let runningPortfolioApprox = 0;

  for (let y = startYear; y < currentYearNow; y++) {
    const investedThisYear = yearlyInvestments[y] || 0;
    runningCumulative += investedThisYear;
    
    // Approximate historical growth
    runningBaseline = (runningBaseline + investedThisYear) * 1.05;
    runningPortfolioApprox = (runningPortfolioApprox + investedThisYear) * (1 + annualROI / 100);

    prediction.push({
      year: y,
      cumulativeInvestment: runningCumulative,
      portfolioValue: runningCumulative, // Real historical portfolio value is unknown, pin it to cumulative to show principal focus
      baselineValue: runningBaseline,
      gainLoss: 0,
      gainLossPercent: 0
    });
  }

  // 2. The Current Year Node (Anchor point with real current portfolio value)
  const investedThisYear = yearlyInvestments[currentYearNow] || 0;
  runningCumulative += investedThisYear;
  
  let portfolioValue = currentPortfolioValueTWD;
  let baselineValue = (runningBaseline + investedThisYear) * 1.05;
  let cumulativeInvestment = runningCumulative;

  prediction.push({
    year: currentYearNow,
    cumulativeInvestment,
    portfolioValue,
    baselineValue,
    gainLoss: portfolioValue - cumulativeInvestment,
    gainLossPercent: cumulativeInvestment > 0 ? ((portfolioValue - cumulativeInvestment) / cumulativeInvestment) * 100 : 0
  });

  for (let i = 1; i <= years; i++) {
    const currentYear = currentYearNow + i;
    // Calculate total annual contribution from monthly config
    const annualInvest = monthlyContributionTWD * 12; 
    
    cumulativeInvestment += annualInvest;
    
    // Normal prediction based on user ROI
    portfolioValue = (portfolioValue + annualInvest) * (1 + annualROI / 100);
    // Baseline prediction based on 5% theoretical ROI
    baselineValue = (baselineValue + annualInvest) * (1 + 5 / 100);

    prediction.push({
      year: currentYear,
      cumulativeInvestment,
      portfolioValue,
      baselineValue,
      gainLoss: portfolioValue - cumulativeInvestment,
      gainLossPercent: cumulativeInvestment > 0 ? ((portfolioValue - cumulativeInvestment) / cumulativeInvestment) * 100 : 0
    });
  }

  return prediction;
};

/**
 * Calculates the Extended Internal Rate of Return (XIRR) for a series of cash flows.
 * Uses the Newton-Raphson method to find the rate where Net Present Value (NPV) is 0.
 * @param cashFlows Array of { amount, date } where amount is negative for investments (outflows) and positive for returns (inflows)
 * @param guess Initial guess for the rate (default 0.1 for 10%)
 * @returns The annualized rate as a decimal (e.g., 0.15 for 15%), or null if it fails to converge
 */
export const calculateXIRR = (
  cashFlows: { amount: number; date: Date }[],
  guess: number = 0.1
): number | null => {
  if (cashFlows.length < 2) return null;

  // Ensure cashflows are sorted by date
  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sortedFlows[0].date.getTime();

  // Function to calculate NPV for a given rate
  const calcNPV = (rate: number) => {
    return sortedFlows.reduce((sum, cf) => {
      const yearsElapsed = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
      return sum + cf.amount / Math.pow(1 + rate, yearsElapsed);
    }, 0);
  };

  // Function to calculate the derivative of NPV for a given rate
  const calcNPVDerivative = (rate: number) => {
    return sortedFlows.reduce((sum, cf) => {
      const yearsElapsed = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
      if (yearsElapsed === 0) return sum;
      return sum - (yearsElapsed * cf.amount) / Math.pow(1 + rate, yearsElapsed + 1);
    }, 0);
  };

  const maxIterations = 100;
  const tolerance = 1e-6;
  let rate = guess;

  for (let i = 0; i < maxIterations; i++) {
    const npv = calcNPV(rate);
    const npvDerivative = calcNPVDerivative(rate);

    if (Math.abs(npv) < tolerance) {
      return rate;
    }

    if (Math.abs(npvDerivative) < 1e-10) {
      // Derivative is practically zero, Newton-Raphson will fail or divide by zero.
      return null;
    }

    const nextRate = rate - npv / npvDerivative;
    
    // XIRR must be strictly greater than -1 (cannot lose more than 100% of capital conceptually in this formula without complex numbers)
    if (nextRate <= -1) {
      rate = -0.99999; // Cap it so we don't blow up Math.pow(negative, fraction)
    } else {
      rate = nextRate;
    }

    // Secondary check for convergence if steps become tiny
    if (Math.abs(nextRate - rate) < tolerance) {
      return nextRate;
    }
  }

  // Failed to converge within maxIterations
  return null;
};
