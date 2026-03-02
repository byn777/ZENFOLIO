
import React from 'react';
import { LayoutDashboard, History, PieChart, TrendingUp, Wallet, DollarSign, ArrowRightLeft } from 'lucide-react';

export type AssetCategory = 'GLOBAL' | 'TW' | 'CRYPTO' | 'BONDS';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  GLOBAL: '全球指數',
  TW: '台股',
  CRYPTO: '加密貨幣',
  BONDS: '債券'
};

export const SUPPORTED_SYMBOLS = [
  { value: "VT", label: "VT (Vanguard 全球股票 ETF)", type: "US", category: 'GLOBAL' as AssetCategory },
  { value: "TSM", label: "TSM (台積電 ADR)", type: "US", category: 'TW' as AssetCategory },
  { value: "0050.TW", label: "0050 (元大台灣50)", type: "TW", category: 'TW' as AssetCategory },
  { value: "006208.TW", label: "006208 (富邦台50)", type: "TW", category: 'TW' as AssetCategory },
  { value: "2330.TW", label: "2330 (台積電)", type: "TW", category: 'TW' as AssetCategory },
  { value: "BTC-USD", label: "BTC (比特幣)", type: "CRYPTO", category: 'CRYPTO' as AssetCategory },
  { value: "ETH-USD", label: "ETH (乙太幣)", type: "CRYPTO", category: 'CRYPTO' as AssetCategory },
  { value: "BND", label: "BND (Vanguard 總體債券 ETF)", type: "US", category: 'BONDS' as AssetCategory },
  { value: "BNDX", label: "BNDX (Vanguard 國際債券 ETF)", type: "US", category: 'BONDS' as AssetCategory },
];

export const MOCK_PRICES: Record<string, number> = {
  "VT": 110.5,
  "TSM": 165.8,
  "0050.TW": 168.45,
  "006208.TW": 48.75,
  "2330.TW": 945.0,
  "BTC-USD": 95200.5,
  "ETH-USD": 2750.2,
  "BND": 72.4,
  "BNDX": 48.2,
  "USDTWD=X": 32.42
};

export const NAV_ITEMS = [
  { id: 'dashboard', label: '資產總覽', icon: <LayoutDashboard size={20} /> },
  { id: 'records', label: '購買紀錄', icon: <History size={20} /> },
  { id: 'rebalance', label: '再平衡工具', icon: <ArrowRightLeft size={20} /> },
  { id: 'prediction', label: '成長預測', icon: <TrendingUp size={20} /> },
];
