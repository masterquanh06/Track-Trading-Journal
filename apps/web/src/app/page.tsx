'use client';

import * as React from 'react';
import {
  Activity,
  ArrowDownRight,
  Clock,
  Crosshair,
  Gauge,
  Globe2,
  Scale,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  AnalyticsBreakdownsResponse,
  AnalyticsOverview,
  EquityCurveResponse,
} from '@trackdailytrade/shared';
import { BreakdownBarChart } from '@/components/charts/breakdown-bar-chart';
import { EquityCurveChart } from '@/components/charts/equity-curve-chart';
import { PnlUnderwaterChart } from '@/components/charts/pnl-underwater-chart';
import { ZellaScoreCard } from '@/components/charts/zella-score-card';
import { useGlobalFilters } from '@/components/layout/filter-context';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import {
  formatCurrency,
  formatDuration,
  getShortTimezoneLabel,
  pnlColorClass,
} from '@/lib/format';
import { usePreferences } from '@/lib/preferences-context';
import { cn } from '@/lib/utils';

type BreakdownTab = 'hour' | 'day' | 'holding' | 'tag';
type CurveMode = 'equity' | 'underwater';

const ALL_VAL = '__all__';

const CURVE_MODES: Array<{ value: CurveMode; label: string }> = [
  { value: 'equity', label: 'Equity Curve' },
  { value: 'underwater', label: 'Cumulative PnL & Drawdown' },
];

export default function DashboardPage() {
  const { t } = usePreferences();
  const { filters, setFilters, symbols, tags, refreshTick, activeAccountCurrency } =
    useGlobalFilters();
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [equityCurve, setEquityCurve] = React.useState<EquityCurveResponse | null>(null);
  const [breakdowns, setBreakdowns] = React.useState<AnalyticsBreakdownsResponse | null>(null);
  const [curveMode, setCurveMode] = React.useState<CurveMode>('equity');
  const [activeTab, setActiveTab] = React.useState<BreakdownTab>('hour');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const tz = filters.timezone ?? 'Asia/Ho_Chi_Minh';
  const shortTz = getShortTimezoneLabel(tz);

  const breakdownTabs = React.useMemo<Array<{ value: BreakdownTab; label: string }>>(
    () => [
      { value: 'hour', label: t.dashboard.tabHour },
      { value: 'day', label: t.dashboard.tabDay },
      { value: 'holding', label: t.dashboard.tabHolding },
      { value: 'tag', label: t.dashboard.tabTag },
    ],
    [t.dashboard],
  );

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ov, eq, bd] = await Promise.all([
          api.getAnalyticsOverview(filters),
          api.getEquityCurve(filters),
          api.getBreakdowns(filters),
        ]);
        if (!cancelled) {
          setOverview(ov);
          setEquityCurve(eq);
          setBreakdowns(bd);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading analytics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [filters, refreshTick]);

  const pfDisplay = React.useMemo(() => {
    if (!overview) return '0.00';
    if (overview.profitFactor !== null) return overview.profitFactor.toFixed(2);
    return Number(overview.grossProfit) > 0 ? '∞' : '0.00';
  }, [overview]);

  const sessionHighlights = React.useMemo(() => {
    const activeSessions = (breakdowns?.bySession ?? []).filter((s) => s.tradeCount > 0);
    if (activeSessions.length === 0) return { bestKey: null, worstKey: null };
    const sorted = [...activeSessions].sort((a, b) => Number(b.netPnl) - Number(a.netPnl));
    const best = Number(sorted[0].netPnl) > 0 ? sorted[0].key : null;
    const worst =
      Number(sorted[sorted.length - 1].netPnl) < 0 ? sorted[sorted.length - 1].key : null;
    return { bestKey: best, worstKey: worst };
  }, [breakdowns]);

  const activeTagVal = filters.tagIds?.[0] || ALL_VAL;
  const activeSymbolVal = filters.symbol || ALL_VAL;
  const sessionNameMap: Record<string, string> = t.dashboard.sessionNames;

  return (
    <div className="space-y-6">
      {/* Header + Compact Asset/Tag Subfilters */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{t.dashboard.title}</h1>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t.dashboard.subtitle} {shortTz}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={activeSymbolVal}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, symbol: v === ALL_VAL ? '' : v }))
            }
          >
            <SelectTrigger className="h-8 w-[145px]">
              <SelectValue placeholder={t.common.allSymbols} />
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
            value={activeTagVal}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, tagIds: v === ALL_VAL ? [] : [v] }))
            }
          >
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue placeholder={t.common.allStrategyTags} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VAL}>{t.common.allStrategyTags}</SelectItem>
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--loss-border)] bg-[var(--loss-bg)] px-4 py-3 text-xs text-loss">
          {error} — {t.common.apiConnectionError}
        </div>
      )}

      {/* Primary KPI Row */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Net PnL</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-subtle text-fg-muted">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          {loading || !overview ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          ) : (
            <>
              <div
                className={`font-num mt-2.5 text-2xl font-bold tracking-tight ${pnlColorClass(overview.netPnl)}`}
              >
                {formatCurrency(overview.netPnl, activeAccountCurrency, true)}
              </div>
              <p className="font-num mt-1.5 text-[11.5px] text-fg-muted">
                {overview.totalTrades} {t.common.tradesCount} ·{' '}
                <span className="text-profit">{overview.winCount}W</span> /{' '}
                <span className="text-loss">{overview.lossCount}L</span>
                {overview.breakevenCount > 0 ? ` / ${overview.breakevenCount}BE` : ''}
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Win Rate</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-subtle text-fg-muted">
              <Target className="h-3.5 w-3.5" />
            </div>
          </div>
          {loading || !overview ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : (
            <>
              <div className="font-num mt-2.5 text-2xl font-bold tracking-tight text-fg">
                {overview.winRate.toFixed(2)}%
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, overview.winRate))}%` }}
                  />
                </div>
                <span className="font-num text-[11px] text-fg-muted">
                  {overview.winCount}W / {overview.lossCount}L
                </span>
              </div>
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Profit Factor</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-subtle text-fg-muted">
              <Scale className="h-3.5 w-3.5" />
            </div>
          </div>
          {loading || !overview ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ) : (
            <>
              <div className="font-num mt-2.5 text-2xl font-bold tracking-tight text-fg">
                {pfDisplay}
              </div>
              <p className="font-num mt-1.5 truncate text-[11.5px] text-fg-muted">
                Avg W{' '}
                <span className="text-profit">
                  {formatCurrency(overview.avgWin, activeAccountCurrency)}
                </span>{' '}
                · L{' '}
                <span className="text-loss">
                  {formatCurrency(overview.avgLoss, activeAccountCurrency)}
                </span>
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Max Drawdown</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--loss-border)] bg-[var(--loss-bg)] text-loss">
              <ArrowDownRight className="h-3.5 w-3.5" />
            </div>
          </div>
          {loading || !overview ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3.5 w-36" />
            </div>
          ) : (
            <>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-num text-2xl font-bold tracking-tight text-loss">
                  -{formatCurrency(overview.maxDrawdownUsd, activeAccountCurrency)}
                </span>
                <Badge variant="loss" className="font-num">
                  -{overview.maxDrawdownPct.toFixed(2)}%
                </Badge>
              </div>
              <p className="font-num mt-1.5 text-[11.5px] text-fg-muted">
                {t.dashboard.startingCapital}{' '}
                {formatCurrency(overview.startingEquity, activeAccountCurrency)}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Secondary KPI Row */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">{t.dashboard.expectancyPerTrade}</span>
            <Gauge className="h-3.5 w-3.5 text-fg-faint" />
          </div>
          {loading || !overview ? (
            <Skeleton className="mt-2 h-6 w-24" />
          ) : (
            <p
              className={`font-num mt-1.5 text-lg font-semibold ${pnlColorClass(overview.expectancy)}`}
            >
              {formatCurrency(overview.expectancy, activeAccountCurrency, true)}
            </p>
          )}
        </Card>

        <Card className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Avg R-Multiple</span>
            <Crosshair className="h-3.5 w-3.5 text-fg-faint" />
          </div>
          {loading || !overview ? (
            <Skeleton className="mt-2 h-6 w-20" />
          ) : (
            <p
              className={`font-num mt-1.5 text-lg font-semibold ${
                overview.expectancyR != null ? pnlColorClass(overview.expectancyR) : 'text-fg-faint'
              }`}
            >
              {overview.expectancyR != null
                ? `${overview.expectancyR >= 0 ? '+' : ''}${overview.expectancyR.toFixed(2)}R`
                : t.dashboard.noRData}
            </p>
          )}
        </Card>

        <Card className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">{t.dashboard.avgHoldingTime}</span>
            <Clock className="h-3.5 w-3.5 text-fg-faint" />
          </div>
          {loading || !overview ? (
            <Skeleton className="mt-2 h-6 w-20" />
          ) : (
            <p className="font-num mt-1.5 text-lg font-semibold text-fg">
              {formatDuration(overview.avgHoldingSeconds)}
            </p>
          )}
        </Card>

        <Card className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">Ending Equity</span>
            <Wallet className="h-3.5 w-3.5 text-fg-faint" />
          </div>
          {loading || !overview ? (
            <Skeleton className="mt-2 h-6 w-28" />
          ) : (
            <p className="font-num mt-1.5 text-lg font-semibold text-fg">
              {formatCurrency(overview.endingEquity, activeAccountCurrency)}
            </p>
          )}
        </Card>
      </div>

      {/* Main Chart + Zella Score Radar Grid */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--accent-fg)]" />
                {curveMode === 'equity'
                  ? 'Equity Curve'
                  : 'Cumulative Net PnL & Drawdown Underwater'}
              </CardTitle>
              <CardDescription>
                {curveMode === 'equity'
                  ? `${t.dashboard.equityCurveDesc} (${shortTz})`
                  : t.dashboard.underwaterDesc}
              </CardDescription>
            </div>
            <SegmentedControl
              options={CURVE_MODES}
              value={curveMode}
              onChange={setCurveMode}
            />
          </CardHeader>
          <CardContent>
            {curveMode === 'equity' ? (
              <EquityCurveChart
                startingEquity={equityCurve?.startingEquity ?? '0'}
                points={equityCurve?.points ?? []}
                currency={activeAccountCurrency}
                timezone={tz}
                loading={loading}
              />
            ) : (
              <PnlUnderwaterChart
                points={equityCurve?.points ?? []}
                currency={activeAccountCurrency}
                timezone={tz}
                loading={loading}
              />
            )}
          </CardContent>
        </Card>

        <ZellaScoreCard
          zellaScore={overview?.zellaScore ?? null}
          totalTrades={overview?.totalTrades ?? 0}
          loading={loading}
        />
      </div>

      {/* Performance by Trading Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-[var(--accent-fg)]" />
            {t.dashboard.sessionTitle}
          </CardTitle>
          <CardDescription>{t.dashboard.sessionSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || !breakdowns ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
            <div className="grid gap-3.5 md:grid-cols-3">
              {breakdowns.bySession.map((session) => {
                const isBest = sessionHighlights.bestKey === session.key;
                const isWorst =
                  sessionHighlights.worstKey === session.key &&
                  sessionHighlights.bestKey !== session.key;

                return (
                  <div
                    key={session.key}
                    className={cn(
                      'rounded-xl border p-4 transition-colors',
                      isBest
                        ? 'border-[var(--profit-border)] bg-[var(--profit-bg)]'
                        : isWorst
                          ? 'border-[var(--loss-border)] bg-[var(--loss-bg)]'
                          : 'border-border bg-elevated',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-fg">
                          {sessionNameMap[session.key] ?? session.label}
                        </p>
                        <p className="font-num mt-0.5 text-[11px] text-fg-muted">
                          {session.vnHoursLabel} ({session.utcHoursLabel})
                        </p>
                      </div>
                      {isBest && <Badge variant="profit">{t.dashboard.bestSession}</Badge>}
                      {isWorst && <Badge variant="loss">{t.dashboard.highRiskSession}</Badge>}
                    </div>

                    <div className="mt-4 flex items-baseline justify-between">
                      <span
                        className={`font-num text-xl font-bold ${pnlColorClass(session.netPnl)}`}
                      >
                        {formatCurrency(session.netPnl, activeAccountCurrency, true)}
                      </span>
                      <span className="font-num text-xs text-fg-muted">
                        {session.tradeCount} {t.common.tradesCount} ({session.winCount}W/
                        {session.lossCount}L)
                      </span>
                    </div>

                    <div className="font-num mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-fg-muted">
                      <span>Win Rate: {session.winRate.toFixed(1)}%</span>
                      <span>
                        PF:{' '}
                        {session.profitFactor !== null
                          ? session.profitFactor.toFixed(2)
                          : session.winCount > 0
                            ? '∞'
                            : '0.00'}
                      </span>
                      <span>
                        Avg R:{' '}
                        {session.avgR !== null
                          ? `${session.avgR >= 0 ? '+' : ''}${session.avgR}R`
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Breakdowns */}
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{t.dashboard.breakdownTitle}</CardTitle>
            <CardDescription>{t.dashboard.breakdownSubtitle}</CardDescription>
          </div>
          <SegmentedControl
            options={breakdownTabs}
            value={activeTab}
            onChange={setActiveTab}
          />
        </CardHeader>
        <CardContent className="space-y-5">
          {activeTab === 'hour' && (
            <BreakdownBarChart
              data={breakdowns?.byHour ?? []}
              currency={activeAccountCurrency}
              loading={loading}
            />
          )}
          {activeTab === 'day' && (
            <BreakdownBarChart
              data={breakdowns?.byDayOfWeek ?? []}
              currency={activeAccountCurrency}
              loading={loading}
            />
          )}
          {activeTab === 'holding' && (
            <BreakdownBarChart
              data={breakdowns?.byHoldingDuration ?? []}
              currency={activeAccountCurrency}
              loading={loading}
            />
          )}
          {activeTab === 'tag' && (
            <div className="space-y-5">
              <BreakdownBarChart
                data={breakdowns?.byTag ?? []}
                currency={activeAccountCurrency}
                hideZeroBuckets
                loading={loading}
              />
              {!loading && breakdowns && breakdowns.byTag.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-border bg-elevated text-[11.5px] font-medium text-fg-muted">
                      <tr>
                        <th className="px-4 py-2.5">{t.dashboard.colStrategyTag}</th>
                        <th className="px-3 py-2.5 text-right">{t.dashboard.colTrades}</th>
                        <th className="px-3 py-2.5 text-right">Win Rate</th>
                        <th className="px-3 py-2.5 text-right">Profit Factor</th>
                        <th className="px-3 py-2.5 text-right">Avg R</th>
                        <th className="px-4 py-2.5 text-right">Net PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {breakdowns.byTag.map((tag) => (
                        <tr key={tag.tagId} className="transition-colors hover:bg-hover">
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2 font-medium text-fg">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.label}
                            </span>
                          </td>
                          <td className="font-num px-3 py-2.5 text-right text-fg-secondary">
                            {tag.tradeCount}{' '}
                            <span className="text-[11px] text-fg-muted">
                              ({tag.winCount}W/{tag.lossCount}L)
                            </span>
                          </td>
                          <td className="font-num px-3 py-2.5 text-right text-fg">
                            {tag.winRate.toFixed(1)}%
                          </td>
                          <td className="font-num px-3 py-2.5 text-right text-fg">
                            {tag.profitFactor !== null ? tag.profitFactor.toFixed(2) : '∞'}
                          </td>
                          <td className="font-num px-3 py-2.5 text-right text-fg">
                            {tag.avgR !== null ? `${tag.avgR >= 0 ? '+' : ''}${tag.avgR}R` : '—'}
                          </td>
                          <td
                            className={`font-num px-4 py-2.5 text-right font-semibold ${pnlColorClass(tag.netPnl)}`}
                          >
                            {formatCurrency(tag.netPnl, activeAccountCurrency, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
