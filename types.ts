
export type Currency = "USD" | "TWD";

export interface PurchaseRecord {
  id: string;
  date: string;
  symbol: string;
  price: number;
  quantity: number;
  currency: Currency;
  type: "BUY" | "SELL";
}

export interface SymbolHolding {
  symbol: string;
  category: string;
  totalQuantity: number;
  totalCostUSD: number;
  currentPrice: number;
  currentMarketValueUSD: number;
  currentPercent: number;
  gainUSD: number;
  gainPercent: number;
}

export interface TargetAllocation {
  symbol: string;
  percent: number;
}

export interface PortfolioData {
  holdings: SymbolHolding[];
  totalMarketValueUSD: number;
  totalCostUSD: number;
  exchangeRate: number;
  timestamp: string;
}

export interface PredictionPoint {
  year: number;
  cumulativeInvestment: number;
  portfolioValue: number;
  gainLoss: number;
  gainLossPercent: number;
}
