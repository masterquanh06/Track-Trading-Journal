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

type SideFilter = 'ALL' | TradeDirection;
const ALL_VAL = '__all__';

const SIDE_OPTIONS: Array<{ value: SideFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'BUY', label: 'BUY' },
  { value: 'SELL', label: 'SELL' },
];

export default function TradesPage() {
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

  // Keyboard shortcut `/` focuses the search input
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
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTrade(updated);
    void api.getAnalyticsOverview(effectiveFilters).then(setSummary).catch(() => {});
  };

  const handleDeleted = (tradeId: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== tradeId));
    setTotal((prev) => Math.max(0, prev - 1));
    void api.getAnalyticsOverview(effectiveFilters).then(setSummary).catch(() => {});
  };

  const hasLocalFilters = Boolean(
    search.trim() || filters.symbol || (filters.tagIds && filters.tagIds.length > 0) || side !== 'ALL',
  );

  const clearLocalFilters = () => {
    setSearch('');
    setSide('ALL');
    setFilters((prev) => ({ ...prev, symbol: '', tagIds: [] }));
  };

  return (
    <div className="space-y-4">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Nhật ký giao dịch</h1>
        <p className="mt-0.5 text-xs text-zinc-400">
          Nhấn vào từng lệnh để gắn Tag chiến lược, ghi chú phân tích và cập nhật Initial SL /
          R-Multiple.
        </p>
      </div>

      {/* Single-row Fintech Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-[#111216] p-2.5 lg:flex-nowrap">
        {/* Search with `/` shortcut hint */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-zinc-500" />
          <Input
            ref={searchInputRef}
            className="h-8 pl-8 pr-10 text-xs"
            placeholder="Tìm symbol, position ID, ghi chú..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1.5 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="font-num pointer-events-none absolute right-2 top-1.5 hidden rounded border border-white/[0.1] bg-[#111216] px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline-block">
              /
            </kbd>
          )}
        </div>

        {/* Symbol Filter */}
        <Select
          value={filters.symbol || ALL_VAL}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, symbol: v === ALL_VAL ? '' : v }))
          }
        >
          <SelectTrigger className="h-8 w-[140px] shrink-0">
            <SelectValue placeholder="Symbol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VAL}>Tất cả Symbol</SelectItem>
            {symbols.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="font-num">{s}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Strategy Tag Filter */}
        <Select
          value={filters.tagIds?.[0] || ALL_VAL}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, tagIds: v === ALL_VAL ? [] : [v] }))
          }
        >
          <SelectTrigger className="h-8 w-[165px] shrink-0">
            <SelectValue placeholder="Tag chiến lược" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VAL}>Tất cả Tag</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Side Segmented Control */}
        <SegmentedControl
          options={SIDE_OPTIONS}
          value={side}
          onChange={setSide}
          className="shrink-0"
        />

        {hasLocalFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2.5 text-xs text-zinc-400"
            onClick={clearLocalFilters}
          >
            <X className="h-3.5 w-3.5" />
            Đặt lại
          </Button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-zinc-500">Số lệnh</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p className="font-num mt-0.5 text-sm font-semibold text-white">
              {total}
              {summary ? (
                <span className="ml-1.5 text-[11px] font-normal text-zinc-500">
                  ({summary.winCount}W/{summary.lossCount}L)
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Net PnL</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-24" />
          ) : (
            <p className={`font-num mt-0.5 text-sm font-semibold ${pnlColorClass(summary.netPnl)}`}>
              {formatCurrency(summary.netPnl, activeAccountCurrency, true)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Win Rate</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p className="font-num mt-0.5 text-sm font-semibold text-zinc-100">
              {summary.winRate.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Avg R-Multiple</p>
          {loading || !summary ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p
              className={`font-num mt-0.5 text-sm font-semibold ${
                summary.expectancyR != null ? pnlColorClass(summary.expectancyR) : 'text-zinc-500'
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
            <thead className="border-b border-white/[0.08] bg-[#16181D]/70 text-[11.5px] font-medium text-zinc-400">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Thời gian đóng ({shortTz})</th>
                <th className="whitespace-nowrap px-3 py-3">Symbol</th>
                <th className="whitespace-nowrap px-3 py-3">Loại</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Volume</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Entry → Exit</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Giữ lệnh</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Net PnL</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">R-Multiple</th>
                <th className="whitespace-nowrap px-4 py-3">Tag &amp; Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
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
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.03] text-zinc-400">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-zinc-100">
                        {hasLocalFilters
                          ? 'Không tìm thấy lệnh khớp bộ lọc'
                          : 'Nhật ký giao dịch của bạn đang trống'}
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                        {hasLocalFilters
                          ? 'Thử điều chỉnh từ khoá tìm kiếm, khung thời gian hoặc đặt lại bộ lọc để xem toàn bộ lịch sử lệnh.'
                          : 'Bắt đầu ghi nhật ký bằng cách tải lên báo cáo lịch sử MT5 (.html / .csv) hoặc kết nối EA Webhook để đồng bộ tự động.'}
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                        {hasLocalFilters ? (
                          <Button size="sm" variant="secondary" onClick={clearLocalFilters}>
                            Xoá bộ lọc hiện tại
                          </Button>
                        ) : (
                          <>
                            <Link href="/import">
                              <Button size="sm">
                                <Upload className="h-3.5 w-3.5" />
                                Import báo cáo MT5
                              </Button>
                            </Link>
                            <Link href="/accounts">
                              <Button size="sm" variant="secondary">
                                <Wallet className="h-3.5 w-3.5" />
                                Quản lý tài khoản
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
                    className="group cursor-pointer transition-colors hover:bg-white/[0.035]"
                  >
                    <td className="font-num whitespace-nowrap px-4 py-3 text-xs text-zinc-400">
                      {formatDateTimeInTz(trade.closeTime, tz)}
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 font-semibold text-zinc-100 group-hover:text-white">
                      {trade.symbol}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={trade.direction === 'BUY' ? 'profit' : 'loss'}>
                        {trade.direction}
                      </Badge>
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-zinc-300">
                      {trade.volume}
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-zinc-400">
                      {trade.openPrice} <span className="text-zinc-600">→</span>{' '}
                      <span className="text-zinc-200">{trade.closePrice}</span>
                    </td>
                    <td className="font-num whitespace-nowrap px-3 py-3 text-right text-xs text-zinc-400">
                      {formatDuration(trade.holdingSeconds)}
                    </td>
                    <td
                      className={`font-num whitespace-nowrap px-3 py-3 text-right font-semibold ${pnlColorClass(trade.netPnl)}`}
                    >
                      {formatCurrency(trade.netPnl, trade.accountCurrency, true)}
                    </td>
                    <td
                      className={`font-num whitespace-nowrap px-3 py-3 text-right text-xs font-medium ${
                        trade.rMultiple ? pnlColorClass(trade.rMultiple) : 'text-zinc-600'
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
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#16181D] px-2 py-0.5 text-[11px] text-zinc-200"
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
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-indigo-500/15 text-indigo-300"
                            title="Đã đính kèm ảnh biểu đồ"
                          >
                            <Camera className="h-3 w-3" />
                          </span>
                        )}
                        {(trade.note || trade.preTradePlan || trade.postTradeReview) && (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/[0.05] text-zinc-400"
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
        <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#0B0C0F]/50 px-4 py-2.5 text-xs text-zinc-400">
          <span className="font-num">
            Hiển thị <strong className="text-zinc-100">{trades.length}</strong> /{' '}
            <strong className="text-zinc-100">{total}</strong> lệnh · Trang {page} / {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Trước
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau
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
