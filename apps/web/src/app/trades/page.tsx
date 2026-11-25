'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  Search,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type { AnalyticsOverview, TradeDirection } from '@trackdailytrade/shared';
import { useGlobalFilters } from '@/components/layout/filter-context';
import { TradeDetailDrawer } from '@/components/trades/trade-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type TradeDto } from '@/lib/api';
import {
  formatCurrency,
  formatDateTimeInTz,
  formatDuration,
  getShortTimezoneLabel,
  pnlColorClass,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';

type SideFilter = 'ALL' | TradeDirection;
const ALL_VAL = '__all__';

export default function TradesPage() {
  const { t } = usePreferences();
  const {
    accounts,
    filters,
    setFilters,
    symbols,
    tags,
    refreshTick,
    refreshReferences,
    activeAccountCurrency,
  } = useGlobalFilters();

  const [trades, setTrades] = React.useState<TradeDto[]>([]);
  const [summary, setSummary] = React.useState<AnalyticsOverview | null>(null);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [side, setSide] = React.useState<SideFilter>('ALL');
  const [selectedTrade, setSelectedTrade] = React.useState<TradeDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const tz = filters.timezone ?? 'Asia/Ho_Chi_Minh';
  const shortTz = getShortTimezoneLabel(tz);

  const sideOptions = React.useMemo<Array<{ value: SideFilter; label: string }>>(
    () => [
      { value: 'ALL', label: t.common.all },
      { value: 'BUY', label: 'BUY' },
      { value: 'SELL', label: 'SELL' },
    ],
    [t.common.all],
  );

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const effectiveFilters = React.useMemo(
    () => ({
      ...filters,
      direction: side === 'ALL' ? undefined : side,
    }),
    [filters, side],
  );

  React.useEffect(() => {
    setPage(1);
  }, [effectiveFilters, search]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, overviewRes] = await Promise.all([
        api.getTrades({
          ...effectiveFilters,
          search: search.trim() || undefined,
          page,
          limit: 25,
        }),
        api.getAnalyticsOverview(effectiveFilters),
      ]);
      setTrades(listRes.items);
      setTotal(listRes.pagination.total);
      setTotalPages(Math.max(1, listRes.pagination.totalPages));
      setSummary(overviewRes);
    } catch (err) {
      console.error('Failed to fetch trades:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveFilters, search, page]);

  React.useEffect(() => {
    void loadData();
  }, [loadData, refreshTick]);

  const handleUpdated = (updated: TradeDto) => {
    setTrades((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedTrade(updated);
    void api.getAnalyticsOverview(effectiveFilters).then(setSummary).catch(() => {});
  };

  const handleDeleted = (tradeId: string) => {
    setTrades((prev) => prev.filter((item) => item.id !== tradeId));
    setTotal((prev) => Math.max(0, prev - 1));
    void api.getAnalyticsOverview(effectiveFilters).then(setSummary).catch(() => {});
  };

  const hasLocalFilters = Boolean(
    search.trim() ||
      filters.symbol ||
      (filters.tagIds && filters.tagIds.length > 0) ||
      side !== 'ALL',
  );

  const clearLocalFilters = () => {
    setSearch('');
    setSide('ALL');
    setFilters((prev) => ({ ...prev, symbol: '', tagIds: [] }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{t.trades.title}</h1>
        <p className="mt-0.5 text-xs text-fg-muted">{t.trades.subtitle}</p>
      </div>

      {/* Single-row Fintech Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-card lg:flex-nowrap">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-fg-muted" />
          <Input
            ref={searchInputRef}
            className="h-8 pl-8 pr-10 text-xs"
            placeholder={t.trades.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button
              type="button"
              aria-label={t.common.reset}
              onClick={() => setSearch('')}
              className="absolute right-2 top-1.5 rounded p-0.5 text-fg-muted hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="font-num pointer-events-none absolute right-2 top-1.5 hidden rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-fg-muted sm:inline-block">
              /
            </kbd>
          )}
        </div>

        <Select
          value={filters.symbol || ALL_VAL}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, symbol: v === ALL_VAL ? '' : v }))
          }
        >
          <SelectTrigger className="h-8 w-[145px] shrink-0">
            <SelectValue placeholder="Symbol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VAL}>{t.common.allSymbols}</SelectItem>
            {symbols.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="font-num">{s}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.tagIds?.[0] || ALL_VAL}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, tagIds: v === ALL_VAL ? [] : [v] }))
          }
        >
          <SelectTrigger className="h-8 w-[165px] shrink-0">
            <SelectValue placeholder={t.common.allTags} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VAL}>{t.common.allTags}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SegmentedControl
          options={sideOptions}
          value={side}
          onChange={setSide}
          className="shrink-0"
        />

        {hasLocalFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={clearLocalFilters}
          >
            <X className="h-3.5 w-3.5" />
            {t.common.reset}
          </Button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-fg-muted">{t.dashboard.colTrades}</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p className="font-num mt-0.5 text-sm font-semibold text-fg">
              {total}
              {summary ? (
                <span className="ml-1.5 text-[11px] font-normal text-fg-muted">
                  ({summary.winCount}W/{summary.lossCount}L)
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-fg-muted">Net PnL</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-24" />
          ) : (
            <p className={`font-num mt-0.5 text-sm font-semibold ${pnlColorClass(summary.netPnl)}`}>
              {formatCurrency(summary.netPnl, activeAccountCurrency, true)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-fg-muted">Win Rate</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p className="font-num mt-0.5 text-sm font-semibold text-fg">
              {summary.winRate.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-fg-muted">Avg R-Multiple</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p
              className={`font-num mt-0.5 text-sm font-semibold ${
                summary.expectancyR != null ? pnlColorClass(summary.expectancyR) : 'text-fg-faint'
              }`}
            >
              {summary.expectancyR != null
                ? `${summary.expectancyR >= 0 ? '+' : ''}${summary.expectancyR.toFixed(2)}R`
                : '—'}
            </p>
          )}
        </div>
      </div>

      {/* Fintech Trades Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border bg-elevated text-[11.5px] font-medium text-fg-muted">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">
                  {t.trades.colCloseTime} ({shortTz})
                </th>
                <th className="whitespace-nowrap px-3 py-3">Symbol</th>
                <th className="whitespace-nowrap px-3 py-3">{t.trades.colSide}</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Volume</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Entry → Exit</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">{t.trades.colHold}</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Net PnL</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">R-Multiple</th>
                <th className="whitespace-nowrap px-4 py-3">{t.trades.colTagsNote}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-subtle text-fg-muted">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-fg">
                        {hasLocalFilters ? t.trades.emptyFilteredTitle : t.trades.emptyTitle}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                        {hasLocalFilters ? t.trades.emptyFilteredDesc : t.trades.emptyDesc}
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                        {hasLocalFilters ? (
                          <Button size="sm" variant="secondary" onClick={clearLocalFilters}>
                            {t.trades.clearCurrentFilters}
                          </Button>
                        ) : (
                          <>
                            <Link href="/import">
                              <Button size="sm">
                                <Upload className="h-3.5 w-3.5" />
                                {t.dashboard.ctaImportMt5}
                              </Button>
                            </Link>
                            <Link href="/accounts">
                              <Button size="sm" variant="secondary">
                                <Wallet className="h-3.5 w-3.5" />
                                {t.dashboard.ctaManageAccounts}
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                trades.map((trade) => (
                  <tr
                    key={trade.id}
                    onClick={() => setSelectedTrade(trade)}
                    className="group cursor-pointer transition-colors hover:bg-hover"
                  >
                    <td className="font-num whitespace-nowrap px-4 py-3 text-xs text-fg-muted">
                      {formatDateTimeInTz(trade.closeTime, tz)}
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 font-semibold text-fg">
                      {trade.symbol}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={trade.direction === 'BUY' ? 'profit' : 'loss'}>
                        {trade.direction}
                      </Badge>
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-fg-secondary">
                      {trade.volume}
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-fg-muted">
                      {trade.openPrice} <span className="text-fg-faint">→</span>{' '}
                      <span className="text-fg">{trade.closePrice}</span>
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-fg-muted">
                      {formatDuration(trade.holdingSeconds)}
                    </td>
                    <td
                      className={`font-num whitespace-nowrap px-3 py-3 text-right font-semibold ${pnlColorClass(trade.netPnl)}`}
                    >
                      {formatCurrency(trade.netPnl, trade.accountCurrency, true)}
                    </td>
                    <td
                      className={`font-num whitespace-nowrap px-3 py-3 text-right text-xs font-medium ${
                        trade.rMultiple ? pnlColorClass(trade.rMultiple) : 'text-fg-faint'
                      }`}
                    >
                      {trade.rMultiple
                        ? `${Number(trade.rMultiple) >= 0 ? '+' : ''}${Number(trade.rMultiple).toFixed(2)}R`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {trade.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px] text-fg-secondary"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </span>
                        ))}
                        {trade.screenshotUrl && (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-bg)] text-[var(--accent-fg)]"
                            title={t.trades.attachedChart}
                          >
                            <Camera className="h-3 w-3" />
                          </span>
                        )}
                        {(trade.note || trade.preTradePlan || trade.postTradeReview) && (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-hover text-fg-muted"
                            title={trade.note ?? trade.preTradePlan ?? trade.postTradeReview ?? ''}
                          >
                            <FileText className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-border bg-subtle px-4 py-2.5 text-xs text-fg-muted">
          <span className="font-num">
            {t.common.showing} <strong className="text-fg">{trades.length}</strong> /{' '}
            <strong className="text-fg">{total}</strong> {t.common.tradesCount} · {t.common.page}{' '}
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t.common.prev}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t.common.next}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <TradeDetailDrawer
        trade={selectedTrade}
        allTags={tags}
        accountBalance={
          selectedTrade
            ? Number(
                accounts.find((a) => a.id === selectedTrade.accountId)?.currentBalance ?? '10000',
              )
            : 10000
        }
        timezone={tz}
        onClose={() => setSelectedTrade(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onTagCreated={refreshReferences}
      />
    </div>
  );
}
