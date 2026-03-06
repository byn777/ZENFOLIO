
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
  
  // Check if all requested symbols are in the cache AND their cached value is valid (>0)
  // This prevents 'poisoned' caches from previous failures (where price was saved as 0) from blocking correctly fetching via the new proxies.
  const allCached = !forceRefresh && cached && symbols.every(sym => cached.prices[sym] && cached.prices[sym] > 0);
  if (allCached) return cached.prices;

  // Filter out any poisoned 0s from the cache before merging, so we gracefully fallback to MOCK_PRICES if the live fetch fails
  const validCachedPrices: Record<string, number> = {};
  if (cached && cached.prices) {
    for (const [k, v] of Object.entries(cached.prices)) {
      if (typeof v === 'number' && v > 0) validCachedPrices[k] = v;
    }
  }

  // We only fetch what we need (the requested symbols) but we merge them into the previous cache to retain old values
  const uniqueSymbols = Array.from(new Set([...symbols, "USDTWD=X"]));
  const finalPrices: Record<string, number> = { ...MOCK_PRICES, ...validCachedPrices };
  
  // STRATEGY 1: GOOGLE SHEETS CSV OMNI-PROXY
  const sheetUrl = import.meta.env.VITE_GOOGLE_SHEET_URL;
  if (sheetUrl) {
    try {
      const sheetResponse = await fetch(sheetUrl);
      if (sheetResponse.ok) {
        const csvText = await sheetResponse.text();
        const rows = csvText.split('\n');
        
        let fetchedAny = false;
        rows.forEach(row => {
          const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 2) {
            const sym = cols[0];
            const price = parseFloat(cols[1]);
            if (uniqueSymbols.includes(sym) && !isNaN(price) && price > 0) {
              finalPrices[sym] = price;
              fetchedAny = true;
            }
          }
        });
        
        if (fetchedAny) {
          sessionStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ prices: finalPrices, timestamp: new Date().toISOString() }));
          return finalPrices; 
        }
      }
    } catch (sheetErr) {
      console.warn("Failed to fetch prices from Google Sheet CSV", sheetErr);
    }
  }

  // STRATEGY 2: GITHUB ACTIONS STATIC JSON BACKEND (The Ultimate Fallback)
  // This reads the JSON compiled by our GitHub Action, which is completely immune to CORS and Proxies
  try {
    const isGhPages = typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');
    const owner = isGhPages ? window.location.hostname.split('.')[0] : 'byn777';
    // The path specifically points to the branch 'prices-data' created by our Action
    const actionsJsonUrl = `https://raw.githubusercontent.com/${owner}/ZENFOLIO/prices-data/public/live_prices.json`;
    
    // Use an AbortController so it doesn't hang if offline
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const githubRes = await fetch(actionsJsonUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (githubRes.ok) {
      const actionsData = await githubRes.json();
      let fetchedAny = false;
      for (const sym of uniqueSymbols) {
        if (actionsData[sym] !== undefined && actionsData[sym] !== null && actionsData[sym] > 0) {
          finalPrices[sym] = actionsData[sym];
          fetchedAny = true;
        }
      }
      
      if (fetchedAny) {
        sessionStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ prices: finalPrices, timestamp: new Date().toISOString() }));
        return finalPrices; // Return instantly before touching any dynamic proxies
      }
    }
  } catch(e) {
    console.warn("GitHub Actions static JSON not yet available or reachable.");
  }

  // STRATEGY 3: YAHOO FINANCE MULTI-PROXY CASCADE (Dynamic Fallback)
  try {
    await Promise.all(uniqueSymbols.map(async (symbol) => {
      try {
        const isProd = import.meta.env.PROD;
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        
        let data = null;
        let fetchSuccess = false;

        // Determine Fetch Strategies
        const endpoints = [];
        
        if (!isProd) {
          // 1. Local Development (Vite Proxy)
          endpoints.push(`/api/yahoo/v8/finance/chart/${symbol}?interval=1d&range=1d`);
        }
        
        // 2. Public CORS Proxies Cascade (Works on both Static Hosts and Local Fallback)
        endpoints.push(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
        endpoints.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
        endpoints.push(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);

        const fetchPromises = endpoints.map(async (endpoint) => {
          // Use AbortController for a 4-second timeout to ensure no request hangs forever
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          
          try {
            const response = await fetch(endpoint, { signal: controller.signal });
            if (!response.ok) throw new Error('HTTP Error');
            const text = await response.text();
            const parsed = JSON.parse(text);
            
            // Validate payload structure
            if (parsed?.chart?.result?.[0]?.meta?.regularMarketPrice || parsed?.quoteResponse?.result?.[0]?.regularMarketPrice) {
              return parsed;
            }
            throw new Error('Invalid JSON structure');
          } finally {
            clearTimeout(timeoutId);
          }
        });

        try {
          // Race all proxies simultaneously! The fastest one to return valid JSON wins instantly.
          data = await Promise.any(fetchPromises);
          fetchSuccess = true;
        } catch (aggregateError) {
          console.warn(`All proxies failed or timed out for ${symbol}`);
        }
        
        if (!fetchSuccess || !data) throw new Error(`All endpoints failed or returned invalid data for ${symbol}`);
        
        // Parse Yahoo Format
        const result = data?.chart?.result?.[0] || data?.quoteResponse?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.regularMarketPrice;
        
        if (price) {
          finalPrices[symbol] = price;
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
