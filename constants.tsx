
import React from 'react';
import { LayoutDashboard, History, PieChart, TrendingUp, Wallet, DollarSign, ArrowRightLeft, BarChart2 } from 'lucide-react';

export type AssetCategory = 'TW' | 'US' | 'UK' | 'CRYPTO' | 'BONDS';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  TW: '台股',
  US: '美股',
  UK: '英股',
  CRYPTO: '加密貨幣',
  BONDS: '美債'
};

export const SUPPORTED_SYMBOLS = [
  { value: "VT", label: "VT (Vanguard 全球股票 ETF)", type: "US", category: 'US' as AssetCategory },
  { value: "TSM", label: "TSM (台積電 ADR)", type: "US", category: 'US' as AssetCategory },
  { value: "0050.TW", label: "0050 (元大台灣50)", type: "TW", category: 'TW' as AssetCategory },
  { value: "006208.TW", label: "006208 (富邦台50)", type: "TW", category: 'TW' as AssetCategory },
  { value: "2330.TW", label: "2330 (台積電)", type: "TW", category: 'TW' as AssetCategory },
  { value: "VUSA.L", label: "VUSA (Vanguard S&P 500 UCITS ETF)", type: "UK", category: 'UK' as AssetCategory },
  { value: "VWRL.L", label: "VWRL (Vanguard FTSE All-World UCITS ETF)", type: "UK", category: 'UK' as AssetCategory },
  { value: "VWRA.L", label: "VWRA (Vanguard FTSE All-World UCITS ETF USD Acc)", type: "UK", category: 'UK' as AssetCategory },
  { value: "BTC-USD", label: "BTC (比特幣)", type: "CRYPTO", category: 'CRYPTO' as AssetCategory },
  { value: "ETH-USD", label: "ETH (乙太幣)", type: "CRYPTO", category: 'CRYPTO' as AssetCategory },
  { value: "BND", label: "BND (Vanguard 總體債券 ETF)", type: "US", category: 'BONDS' as AssetCategory },
  { value: "BNDX", label: "BNDX (Vanguard 國際債券 ETF)", type: "US", category: 'BONDS' as AssetCategory },
  { value: "AGGU.L", label: "AGGU (iShares Core Global Aggregate Bond UCITS ETF)", type: "UK", category: 'BONDS' as AssetCategory },
];

export const MOCK_PRICES: Record<string, number> = {
  "VT": 133.50,
  "TSM": 195.80,
  "0050.TW": 204.45,
  "006208.TW": 118.00,
  "2330.TW": 1050.00,
  "VUSA.L": 102.35,
  "VWRL.L": 135.42,
  "VWRA.L": 168.50,
  "BTC-USD": 95200.00,
  "ETH-USD": 2750.00,
  "BND": 72.40,
  "BNDX": 48.20,
  "AGGU.L": 5.12,
  "USDTWD=X": 32.42
};

export const NAV_ITEMS = [
  { id: 'dashboard', label: '資產總覽', icon: <LayoutDashboard size={20} /> },
  { id: 'records', label: '購買紀錄', icon: <History size={20} /> },
  { id: 'rebalance', label: '再平衡工具', icon: <ArrowRightLeft size={20} /> },
  { id: 'prediction', label: '成長預測', icon: <TrendingUp size={20} /> },
  { id: 'annual', label: '年度成本', icon: <BarChart2 size={20} /> },
];
