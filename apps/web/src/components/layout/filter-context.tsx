'use client';

import * as React from 'react';
import { aggregatePortfolioCapital } from '@trackdailytrade/shared';
import { api, type AccountDto, type GlobalFilterParams, type TagDto } from '@/lib/api';

export type DatePreset = '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';

interface FilterContextValue {
  accounts: AccountDto[];
  tags: TagDto[];
  symbols: string[];
  loadingRefs: boolean;
  filters: GlobalFilterParams;
  datePreset: DatePreset;
  refreshTick: number;
  isRefreshing: boolean;
  setFilters: React.Dispatch<React.SetStateAction<GlobalFilterParams>>;
  applyDatePreset: (preset: Exclude<DatePreset, 'custom'>) => void;
  setCustomDateRange: (range: { from: string; to: string }) => void;
  resetFilters: () => void;
  refreshReferences: () => Promise<void>;
  triggerGlobalRefresh: () => Promise<void>;
  activeAccountCurrency: string;
  selectedAccount: AccountDto | null;
  totalPortfolioEquity: string;
  totalPortfolioBalance: string;
  totalPortfolioNetPnl: string;
}

const DEFAULT_FILTERS: GlobalFilterParams = {
  accountId: '',
  from: '',
  to: '',
  symbol: '',
  direction: undefined,
  tagIds: [],
  timezone: 'Asia/Ho_Chi_Minh',
};

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const FilterContext = React.createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<AccountDto[]>([]);
  const [tags, setTags] = React.useState<TagDto[]>([]);
  const [symbols, setSymbols] = React.useState<string[]>([]);
  const [loadingRefs, setLoadingRefs] = React.useState(true);
  const [filters, setFilters] = React.useState<GlobalFilterParams>(DEFAULT_FILTERS);
  const [datePreset, setDatePreset] = React.useState<DatePreset>('all');
  const [refreshTick, setRefreshTick] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const refreshReferences = React.useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [accs, tgs, syms] = await Promise.all([
        api.getAccounts(),
        api.getTags(),
        api.getSymbols(filters.accountId || undefined),
      ]);
      setAccounts(accs);
      setTags(tgs);
      setSymbols(syms);
    } catch (err) {
      console.error('Failed to load filter references:', err);
    } finally {
      setLoadingRefs(false);
    }
  }, [filters.accountId]);

  React.useEffect(() => {
    void refreshReferences();
  }, [refreshReferences]);

  const applyDatePreset = React.useCallback((preset: Exclude<DatePreset, 'custom'>) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setFilters((prev) => ({ ...prev, from: '', to: '' }));
      return;
    }

    const now = new Date();
    const to = toYmd(now);
    let fromDate: Date;
    if (preset === 'ytd') {
      fromDate = new Date(now.getFullYear(), 0, 1);
    } else {
      const daysMap = { '7d': 7, '30d': 30, '90d': 90 } as const;
      fromDate = new Date(now.getTime() - daysMap[preset] * 86400 * 1000);
    }
    setFilters((prev) => ({ ...prev, from: toYmd(fromDate), to }));
  }, []);

  const setCustomDateRange = React.useCallback((range: { from: string; to: string }) => {
    setFilters((prev) => ({ ...prev, from: range.from, to: range.to }));
    setDatePreset(range.from || range.to ? 'custom' : 'all');
  }, []);

  const resetFilters = React.useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDatePreset('all');
  }, []);

  const triggerGlobalRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    setRefreshTick((t) => t + 1);
    await refreshReferences();
    setTimeout(() => setIsRefreshing(false), 350);
  }, [refreshReferences]);

  const selectedAccount = React.useMemo(
    () => (filters.accountId ? accounts.find((a) => a.id === filters.accountId) ?? null : null),
    [accounts, filters.accountId],
  );

  const activeAccountCurrency = React.useMemo(
    () => selectedAccount?.currency ?? accounts[0]?.currency ?? 'USD',
    [selectedAccount, accounts],
  );

  const portfolioCapital = React.useMemo(
    () => aggregatePortfolioCapital(accounts),
    [accounts],
  );

  const totalPortfolioEquity = portfolioCapital.totalCurrentEquity;
  const totalPortfolioBalance = portfolioCapital.totalCurrentBalance;
  const totalPortfolioNetPnl = portfolioCapital.totalNetPnl;

  const value = React.useMemo<FilterContextValue>(
    () => ({
      accounts,
      tags,
      symbols,
      loadingRefs,
      filters,
      datePreset,
      refreshTick,
      isRefreshing,
      setFilters,
      applyDatePreset,
      setCustomDateRange,
      resetFilters,
      refreshReferences,
      triggerGlobalRefresh,
      activeAccountCurrency,
      selectedAccount,
      totalPortfolioEquity,
      totalPortfolioBalance,
      totalPortfolioNetPnl,
    }),
    [
      accounts,
      tags,
      symbols,
      loadingRefs,
      filters,
      datePreset,
      refreshTick,
      isRefreshing,
      applyDatePreset,
      setCustomDateRange,
      resetFilters,
      refreshReferences,
      triggerGlobalRefresh,
      activeAccountCurrency,
      selectedAccount,
      totalPortfolioEquity,
      totalPortfolioBalance,
      totalPortfolioNetPnl,
    ],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useGlobalFilters() {
  const ctx = React.useContext(FilterContext);
  if (!ctx) {
    throw new Error('useGlobalFilters must be used inside FilterProvider');
  }
  return ctx;
}
