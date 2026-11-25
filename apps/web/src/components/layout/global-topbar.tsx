'use client';

import * as React from 'react';
import {
  Globe,
  Languages,
  Moon,
  RefreshCw,
  Sun,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DISPLAY_TIMEZONE_PRESETS,
  formatCompactCurrency,
  getShortTimezoneLabel,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';
import { type DatePreset, useGlobalFilters } from './filter-context';

const ALL_ACCOUNTS_VAL = '__all__';

export function GlobalTopbar() {
  const {
    theme,
    toggleTheme,
    locale,
    toggleLocale,
    t,
  } = usePreferences();

  const {
    accounts,
    filters,
    datePreset,
    isRefreshing,
    setFilters,
    applyDatePreset,
    setCustomDateRange,
    triggerGlobalRefresh,
    selectedAccount,
    activeAccountCurrency,
    totalPortfolioEquity,
  } = useGlobalFilters();

  const presetOptions = React.useMemo<
    Array<{ value: Exclude<DatePreset, 'custom'>; label: string }>
  >(
    () => [
      { value: '7d', label: '7D' },
      { value: '30d', label: '30D' },
      { value: '90d', label: '90D' },
      { value: 'ytd', label: 'YTD' },
      { value: 'all', label: t.common.all },
    ],
    [t.common.all],
  );

  const currentAccountVal = filters.accountId || ALL_ACCOUNTS_VAL;
  const activeTimezone = filters.timezone || 'Asia/Ho_Chi_Minh';
  const shortTz = getShortTimezoneLabel(activeTimezone);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2.5 border-b border-border bg-topbar px-4 backdrop-blur-md lg:px-6">
      {/* Left: Global Account Switcher */}
      <div className="flex min-w-0 items-center gap-2">
        <Select
          value={currentAccountVal}
          onValueChange={(val) =>
            setFilters((prev) => ({
              ...prev,
              accountId: val === ALL_ACCOUNTS_VAL ? '' : val,
            }))
          }
        >
          <SelectTrigger
            aria-label={t.topbar.selectAccount}
            className="h-8 w-[195px] sm:w-[235px]"
          >
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                <span className="truncate text-[12.5px] font-medium text-fg">
                  {selectedAccount
                    ? selectedAccount.name
                    : `${t.topbar.allAccounts} (${accounts.length})`}
                </span>
              </span>
              <span className="font-num shrink-0 rounded bg-hover px-1.5 py-0.5 text-[11px] text-fg-secondary">
                {formatCompactCurrency(
                  selectedAccount ? selectedAccount.currentEquity : totalPortfolioEquity,
                  activeAccountCurrency,
                )}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="w-[290px]">
            <SelectItem value={ALL_ACCOUNTS_VAL}>
              <div className="flex w-full items-center justify-between gap-3">
                <span className="font-medium">
                  {t.topbar.allAccounts} ({accounts.length})
                </span>
                <span className="font-num text-[11px] text-fg-muted">
                  {formatCompactCurrency(totalPortfolioEquity, activeAccountCurrency)}
                </span>
              </div>
            </SelectItem>
            {accounts.length > 0 && <SelectSeparator />}
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{acc.name}</p>
                    <p className="font-num text-[10.5px] text-fg-faint">#{acc.accountNumber}</p>
                  </div>
                  <span className="font-num shrink-0 text-[11.5px] text-fg-secondary">
                    {formatCompactCurrency(acc.currentEquity, acc.currency)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right: Date Presets + Custom Range + Timezone + Independent Theme & Language Toggles + Refresh */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto">
        <SegmentedControl
          options={presetOptions}
          value={datePreset === 'custom' ? ('all' as Exclude<DatePreset, 'custom'>) : datePreset}
          onChange={applyDatePreset}
          className={cn(
            datePreset === 'custom' &&
              '[&_button]:bg-transparent [&_button]:text-fg-muted [&_button]:shadow-none [&_button]:ring-0',
          )}
        />

        <DateRangePicker
          from={filters.from ?? ''}
          to={filters.to ?? ''}
          onChange={setCustomDateRange}
        />

        <Select
          value={activeTimezone}
          onValueChange={(val) => setFilters((prev) => ({ ...prev, timezone: val }))}
        >
          <SelectTrigger aria-label={t.topbar.displayTimezone} className="h-8 w-[92px] shrink-0">
            <div className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              <SelectValue>{shortTz}</SelectValue>
            </div>
          </SelectTrigger>
          <SelectContent className="w-[195px]" align="end">
            {DISPLAY_TIMEZONE_PRESETS.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mx-0.5 h-4 w-px bg-border" />

        {/* Independent Button 1: Theme Toggle (Dark <-> Light) */}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={toggleTheme}
          title={theme === 'dark' ? t.topbar.switchToLight : t.topbar.switchToDark}
          aria-label={theme === 'dark' ? t.topbar.switchToLight : t.topbar.switchToDark}
          data-testid="theme-toggle-btn"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-indigo-600" />
          )}
        </Button>

        {/* Independent Button 2: Language Toggle (VI <-> EN) */}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={toggleLocale}
          title={locale === 'vi' ? t.topbar.switchToEn : t.topbar.switchToVi}
          aria-label={locale === 'vi' ? t.topbar.switchToEn : t.topbar.switchToVi}
          data-testid="locale-toggle-btn"
          className="h-8 gap-1 px-2.5"
        >
          <Languages className="h-3.5 w-3.5 text-fg-muted" />
          <span className="font-num text-[11.5px] font-semibold uppercase text-fg">
            {locale}
          </span>
        </Button>

        {/* Refresh */}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          title={t.topbar.refresh}
          aria-label={t.topbar.refresh}
          onClick={() => void triggerGlobalRefresh()}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5 text-fg-secondary', isRefreshing && 'animate-spin text-indigo-500')}
          />
        </Button>
      </div>
    </header>
  );
}
