'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarDaySummary } from '@trackdailytrade/shared';
import { useGlobalFilters } from '@/components/layout/filter-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatCurrency, getShortTimezoneLabel, pnlColorClass } from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

function formatMonthParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const { locale, t } = usePreferences();
  const { filters, refreshTick, setCustomDateRange, activeAccountCurrency } = useGlobalFilters();
  const [cursor, setCursor] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [days, setDays] = React.useState<CalendarDaySummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  const tz = filters.timezone ?? 'Asia/Ho_Chi_Minh';
  const shortTz = getShortTimezoneLabel(tz);
  const monthStr = formatMonthParam(cursor);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await api.getCalendar({ ...filters, month: monthStr });
        if (!cancelled) setDays(res);
      } catch (err) {
        console.error('Failed to fetch calendar:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [filters, monthStr, refreshTick]);

  const dayMap = React.useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const monthStats = React.useMemo(() => {
    let netPnl = 0;
    let totalTrades = 0;
    let greenDays = 0;
    let redDays = 0;
    let maxAbsPnl = 0;

    for (const d of days) {
      const p = Number(d.netPnl);
      netPnl += p;
      totalTrades += d.tradeCount;
      if (p > 0) greenDays++;
      else if (p < 0) redDays++;
      if (Math.abs(p) > maxAbsPnl) maxAbsPnl = Math.abs(p);
    }

    return { netPnl, totalTrades, greenDays, redDays, maxAbsPnl };
  }, [days]);

  const weeks = React.useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{ dateKey: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ dateKey: null, dayNum: null });
    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey, dayNum: d });
    }
    while (cells.length % 7 !== 0) cells.push({ dateKey: null, dayNum: null });

    const grouped: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) {
      grouped.push(cells.slice(i, i + 7));
    }
    return grouped;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });

  const getCellIntensityClass = (pnl: number) => {
    const ratio = monthStats.maxAbsPnl > 0 ? Math.abs(pnl) / monthStats.maxAbsPnl : 0;
    if (pnl > 0) {
      if (ratio >= 0.66)
        return 'border-emerald-500/45 bg-emerald-500/[0.18] hover:border-emerald-500/75';
      if (ratio >= 0.33)
        return 'border-emerald-500/35 bg-emerald-500/[0.12] hover:border-emerald-500/60';
      return 'border-emerald-500/25 bg-emerald-500/[0.07] hover:border-emerald-500/45';
    }
    if (pnl < 0) {
      if (ratio >= 0.66)
        return 'border-rose-500/45 bg-rose-500/[0.18] hover:border-rose-500/75';
      if (ratio >= 0.33)
        return 'border-rose-500/35 bg-rose-500/[0.12] hover:border-rose-500/60';
      return 'border-rose-500/25 bg-rose-500/[0.07] hover:border-rose-500/45';
    }
    return 'border-border bg-subtle';
  };

  const handleDaySelect = (dateKey: string) => {
    setCustomDateRange({ from: dateKey, to: dateKey });
    router.push('/trades');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{t.calendar.title}</h1>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t.calendar.subtitle} ({shortTz})
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="secondary"
            aria-label={t.calendar.prevMonth}
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            {t.calendar.thisMonth}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t.calendar.nextMonth}
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base capitalize text-fg">{monthLabel}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-num">
              {monthStats.totalTrades} {t.common.tradesCount}
            </Badge>
            <Badge variant="secondary" className="font-num">
              <span className="text-profit">
                {monthStats.greenDays} {t.calendar.greenDays}
              </span>
              <span className="mx-1 text-fg-faint">·</span>
              <span className="text-loss">
                {monthStats.redDays} {t.calendar.redDays}
              </span>
            </Badge>
            <Badge
              variant={
                monthStats.netPnl > 0 ? 'profit' : monthStats.netPnl < 0 ? 'loss' : 'secondary'
              }
              className="font-num text-xs"
            >
              {formatCurrency(monthStats.netPnl, activeAccountCurrency, true)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {t.calendar.weekdays.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
                <div className="py-1 text-indigo-500">{t.calendar.weeklyTotal}</div>
              </div>

              <div className="mt-2 space-y-2">
                {weeks.map((week, wIdx) => {
                  const weekPnl = week.reduce((acc, cell) => {
                    if (!cell.dateKey) return acc;
                    const d = dayMap.get(cell.dateKey);
                    return acc + (d ? Number(d.netPnl) : 0);
                  }, 0);
                  const weekTrades = week.reduce((acc, cell) => {
                    if (!cell.dateKey) return acc;
                    const d = dayMap.get(cell.dateKey);
                    return acc + (d ? d.tradeCount : 0);
                  }, 0);

                  return (
                    <div key={wIdx} className="grid grid-cols-8 gap-2">
                      {week.map((cell, cIdx) => {
                        if (!cell.dateKey) {
                          return (
                            <div
                              key={cIdx}
                              className="min-h-[92px] rounded-xl border border-dashed border-border bg-subtle opacity-45"
                            />
                          );
                        }

                        const summary = dayMap.get(cell.dateKey);
                        const pnl = summary ? Number(summary.netPnl) : 0;

                        if (summary) {
                          return (
                            <button
                              key={cell.dateKey}
                              type="button"
                              onClick={() => handleDaySelect(cell.dateKey!)}
                              className={cn(
                                'flex min-h-[92px] flex-col justify-between rounded-xl border p-2.5 text-left transition-all',
                                getCellIntensityClass(pnl),
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-num text-xs font-medium text-fg-secondary">
                                  {cell.dayNum}
                                </span>
                                <span className="font-num text-[10.5px] text-fg-muted">
                                  {summary.tradeCount}T
                                </span>
                              </div>
                              <div className="text-right">
                                <p
                                  className={`font-num text-[13px] font-bold tracking-tight ${pnlColorClass(summary.netPnl)}`}
                                >
                                  {formatCurrency(summary.netPnl, activeAccountCurrency, true)}
                                </p>
                                <p className="font-num mt-0.5 text-[10.5px] text-fg-muted">
                                  {summary.winCount}W / {summary.lossCount}L
                                </p>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <div
                            key={cell.dateKey}
                            className="flex min-h-[92px] flex-col justify-between rounded-xl border border-border bg-subtle p-2.5"
                          >
                            <span className="font-num text-xs text-fg-muted">{cell.dayNum}</span>
                            {loading ? (
                              <Skeleton className="ml-auto h-4 w-12" />
                            ) : (
                              <span className="font-num text-right text-[11px] text-fg-faint">
                                —
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Weekly Summary Column */}
                      <div className="flex min-h-[92px] flex-col justify-between rounded-xl border border-border bg-elevated p-2.5">
                        <span className="text-[11px] font-medium text-fg-muted">
                          {t.calendar.weekPrefix} {wIdx + 1}
                        </span>
                        <div className="text-right">
                          <p
                            className={cn(
                              'font-num text-[13px] font-bold',
                              weekTrades > 0 ? pnlColorClass(weekPnl) : 'text-fg-faint',
                            )}
                          >
                            {weekTrades > 0
                              ? formatCurrency(weekPnl, activeAccountCurrency, true)
                              : '—'}
                          </p>
                          <p className="font-num mt-0.5 text-[10.5px] text-fg-muted">
                            {weekTrades > 0
                              ? `${weekTrades} ${t.common.tradesCount}`
                              : t.calendar.noTradeDay}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
