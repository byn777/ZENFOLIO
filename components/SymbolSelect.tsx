import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { AssetCategory, CATEGORY_LABELS, SUPPORTED_SYMBOLS } from '../constants';

interface SymbolSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const SymbolSelect: React.FC<SymbolSelectProps> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('TW');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const categories = Object.keys(CATEGORY_LABELS) as AssetCategory[];

  const filteredSymbols = useMemo(() => {
    return SUPPORTED_SYMBOLS.filter(symbol => {
      const matchesSearch = symbol.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          symbol.value.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = symbol.category === activeCategory;
      return searchTerm ? matchesSearch : matchesCategory; // Active search overrides category tab
    });
  }, [searchTerm, activeCategory]);

  const selectedSymbol = SUPPORTED_SYMBOLS.find(s => s.value === value) || SUPPORTED_SYMBOLS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm flex items-center justify-between hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
      >
        <span className="font-medium text-slate-700 truncate">{selectedSymbol.label}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full md:w-[400px] mt-2 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden animate-slide-up origin-top">
          {/* Header & Search */}
          <div className="p-4 border-b border-slate-50 relative">
            <div className="flex items-center bg-slate-50 px-4 py-3 rounded-2xl">
              <Search size={18} className="text-slate-400 mr-3" />
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
                placeholder="搜尋代碼或名稱..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Categories Tab */}
          {!searchTerm && (
            <div className="flex overflow-x-auto hide-scrollbar border-b border-slate-50 px-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveCategory(cat);
                  }}
                  className={`px-4 py-3 text-sm font-bold tracking-wide whitespace-nowrap transition-colors border-b-2 ${
                    activeCategory === cat 
                      ? 'border-blue-500 text-blue-600' 
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Symbol List */}
          <div className="max-h-[300px] overflow-y-auto p-2">
            {filteredSymbols.length > 0 ? (
              filteredSymbols.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onChange(item.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full text-left px-4 py-3 rounded-2xl flex items-center justify-between group transition-colors ${
                    value === item.value ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className={`font-bold text-sm ${value === item.value ? 'text-blue-700' : 'text-slate-800'}`}>
                      {item.value}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {item.label}
                    </div>
                  </div>
                  {value === item.value && (
                    <Check size={18} className="text-blue-500" />
                  )}
                  {value !== item.value && (
                    <span className="text-[10px] uppercase font-bold text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      {CATEGORY_LABELS[item.category as AssetCategory]}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm">
                找不到相關標的
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
